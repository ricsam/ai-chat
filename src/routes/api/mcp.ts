import { createMCPClient } from "@ai-sdk/mcp";
import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { detectToolDrift, fingerprintTools } from "ai";
import { z } from "zod";
import { sessionFromRequest } from "@/server/auth";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { db } from "@/server/db";
import { HttpError, assertSafeOutboundUrl, jsonError } from "@/server/http";
import { mcpServers } from "@/server/schema";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().url(),
  transport: z.enum(["http", "sse"]).default("http"),
  headers: z.record(z.string(), z.string()).optional(),
});

async function owned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .limit(1);
  if (!row) throw new HttpError(404, "MCP server not found", "not_found");
  return row;
}

async function inspect(row: typeof mcpServers.$inferSelect) {
  await assertSafeOutboundUrl(row.url);
  const headers = row.headersEnvelope
    ? (JSON.parse(decryptSecret(row.headersEnvelope) ?? "{}") as Record<
        string,
        string
      >)
    : {};
  const client = await createMCPClient({
    transport: {
      type: row.transport as "http" | "sse",
      url: row.url,
      headers,
      redirect: "error",
    },
    maxRetries: 0,
  });
  try {
    const tools = await client.tools();
    const fingerprint = await fingerprintTools(tools);
    const definitions = await client.listTools();
    const discoveredTools = definitions.tools
      .slice(0, 100)
      .map((tool) => ({ name: tool.name, description: tool.description }));
    const drift = row.trustedFingerprint
      ? detectToolDrift(fingerprint, row.trustedFingerprint)
      : { added: Object.keys(fingerprint), changed: [], removed: [] };
    return { fingerprint, discoveredTools, drift };
  } finally {
    await client.close();
  }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const rows = await db
            .select()
            .from(mcpServers)
            .where(eq(mcpServers.userId, user.id))
            .orderBy(desc(mcpServers.updatedAt));
          return Response.json({
            servers: rows.map(({ headersEnvelope, ...row }) => ({
              ...row,
              hasHeaders: Boolean(headersEnvelope),
            })),
          });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const input = inputSchema.parse(await request.json());
          await assertSafeOutboundUrl(input.url);
          const [row] = await db
            .insert(mcpServers)
            .values({
              userId: user.id,
              name: input.name,
              url: input.url,
              transport: input.transport,
              headersEnvelope: encryptSecret(
                input.headers ? JSON.stringify(input.headers) : null,
              ),
            })
            .returning();
          return Response.json(
            { server: row && { ...row, headersEnvelope: undefined } },
            { status: 201 },
          );
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid MCP server",
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
              url: z.string().url().optional(),
              transport: z.enum(["http", "sse"]).optional(),
              headers: z.record(z.string(), z.string()).optional(),
              enabled: z.boolean().optional(),
            })
            .parse(await request.json());
          const current = await owned(user.id, body.id);
          if (body.url) await assertSafeOutboundUrl(body.url);
          const [row] = await db
            .update(mcpServers)
            .set({
              name: body.name,
              url: body.url,
              transport: body.transport,
              headersEnvelope:
                body.headers === undefined
                  ? current.headersEnvelope
                  : encryptSecret(JSON.stringify(body.headers)),
              enabled: body.enabled,
              trustRequired:
                body.url || body.headers || body.transport
                  ? true
                  : current.trustRequired,
              updatedAt: new Date(),
            })
            .where(eq(mcpServers.id, current.id))
            .returning();
          return Response.json({
            server: row && { ...row, headersEnvelope: undefined },
          });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid MCP server",
                )
              : error,
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const id = new URL(request.url).searchParams.get("id");
          if (!id) throw new HttpError(400, "MCP server ID is required");
          await owned(user.id, id);
          await db.delete(mcpServers).where(eq(mcpServers.id, id));
          return new Response(null, { status: 204 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});

export async function testMcp(request: Request, trust: boolean) {
  const { user } = await sessionFromRequest(request);
  const { id } = z.object({ id: z.string() }).parse(await request.json());
  const row = await owned(user.id, id);
  const result = await inspect(row);
  const trustRequired =
    !trust &&
    (result.drift.added.length > 0 || result.drift.changed.length > 0);
  await db
    .update(mcpServers)
    .set({
      discoveredTools: result.discoveredTools,
      trustedFingerprint: trust ? result.fingerprint : row.trustedFingerprint,
      trustRequired: trust ? false : trustRequired,
      lastTestedAt: new Date(),
      lastTestMessage: trustRequired
        ? "Tool definitions changed; review and trust them again"
        : "Connected successfully",
      updatedAt: new Date(),
    })
    .where(eq(mcpServers.id, row.id));
  return {
    message: trust
      ? "Connected and trusted"
      : trustRequired
        ? "Review the discovered tools before trusting this server"
        : "Connected successfully",
    tools: result.discoveredTools,
    drift: result.drift,
    trustRequired: trust ? false : trustRequired,
  };
}
