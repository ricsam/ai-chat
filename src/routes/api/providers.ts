import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { sessionFromRequest } from "@/server/auth";
import { db } from "@/server/db";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { HttpError, jsonError, safeFetch } from "@/server/http";
import { models, providers } from "@/server/schema";

const providerInput = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().url(),
  apiKey: z.string().max(4096).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  modelName: z.string().trim().max(200).optional(),
});

async function owned(userId: string, id: string) {
  const [provider] = await db
    .select()
    .from(providers)
    .where(and(eq(providers.id, id), eq(providers.userId, userId)))
    .limit(1);
  if (!provider) throw new HttpError(404, "Provider not found", "not_found");
  return provider;
}

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const rows = await db
            .select()
            .from(providers)
            .where(eq(providers.userId, user.id))
            .orderBy(desc(providers.updatedAt));
          const providerModels = await db
            .select()
            .from(models)
            .where(eq(models.userId, user.id));
          return Response.json({
            providers: rows.map(
              ({ secretEnvelope, headersEnvelope, ...row }) => ({
                ...row,
                hasApiKey: Boolean(secretEnvelope),
                hasHeaders: Boolean(headersEnvelope),
                models: providerModels.filter(
                  (model) => model.providerId === row.id,
                ),
              }),
            ),
          });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const input = providerInput.parse(await request.json());
          const url = new URL(input.baseUrl);
          url.pathname = url.pathname.replace(/\/$/, "");
          const [row] = await db
            .insert(providers)
            .values({
              userId: user.id,
              name: input.name,
              baseUrl: url.toString().replace(/\/$/, ""),
              secretEnvelope: encryptSecret(input.apiKey),
              headersEnvelope: encryptSecret(
                input.headers ? JSON.stringify(input.headers) : null,
              ),
            })
            .returning();
          if (input.modelId && row)
            await db.insert(models).values({
              userId: user.id,
              providerId: row.id,
              modelId: input.modelId,
              name: input.modelName || input.modelId,
              isDefault: true,
            });
          return Response.json(
            {
              provider: row && {
                ...row,
                secretEnvelope: undefined,
                headersEnvelope: undefined,
              },
            },
            { status: 201 },
          );
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid provider",
                )
              : error,
          );
        }
      },
      PATCH: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const body = z
            .object({
              id: z.string(),
              name: z.string().trim().min(1).max(80).optional(),
              baseUrl: z.string().url().optional(),
              apiKey: z.string().max(4096).optional(),
              headers: z.record(z.string(), z.string()).optional(),
              enabled: z.boolean().optional(),
            })
            .parse(await request.json());
          const current = await owned(user.id, body.id);
          const [row] = await db
            .update(providers)
            .set({
              name: body.name,
              baseUrl: body.baseUrl,
              enabled: body.enabled,
              secretEnvelope:
                body.apiKey === undefined
                  ? current.secretEnvelope
                  : encryptSecret(body.apiKey),
              headersEnvelope:
                body.headers === undefined
                  ? current.headersEnvelope
                  : encryptSecret(JSON.stringify(body.headers)),
              updatedAt: new Date(),
            })
            .where(eq(providers.id, current.id))
            .returning();
          return Response.json({
            provider: row && {
              ...row,
              secretEnvelope: undefined,
              headersEnvelope: undefined,
            },
          });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid provider",
                )
              : error,
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const id = new URL(request.url).searchParams.get("id");
          if (!id) throw new HttpError(400, "Provider ID is required");
          await owned(user.id, id);
          await db.delete(providers).where(eq(providers.id, id));
          return new Response(null, { status: 204 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});

export async function testProvider(request: Request) {
  const { user } = await sessionFromRequest(request);
  const { id } = z.object({ id: z.string() }).parse(await request.json());
  const provider = await owned(user.id, id);
  const headers = provider.headersEnvelope
    ? (JSON.parse(decryptSecret(provider.headersEnvelope) ?? "{}") as Record<
        string,
        string
      >)
    : {};
  const apiKey = decryptSecret(provider.secretEnvelope);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await safeFetch(
    `${provider.baseUrl.replace(/\/$/, "")}/models`,
    { headers },
  );
  const ok = response.ok;
  const message = ok
    ? "Connected successfully"
    : `Provider returned HTTP ${response.status}`;
  await db
    .update(providers)
    .set({
      lastTestedAt: new Date(),
      lastTestSucceeded: ok,
      lastTestMessage: message,
    })
    .where(eq(providers.id, provider.id));
  if (!ok) throw new HttpError(400, message, "provider_test_failed");
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string }>;
  };
  return {
    message,
    models: (payload.data ?? [])
      .flatMap((item) => (item.id ? [item.id] : []))
      .slice(0, 250),
  };
}
