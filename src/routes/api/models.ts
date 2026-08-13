import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { sessionFromRequest } from "@/server/auth";
import { db } from "@/server/db";
import { HttpError, jsonError } from "@/server/http";
import { models, providers } from "@/server/schema";

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const input = z
            .object({
              providerId: z.string(),
              modelId: z.string().trim().min(1).max(200),
              name: z.string().trim().min(1).max(200),
              reasoning: z.boolean().default(false),
              tools: z.boolean().default(true),
              isDefault: z.boolean().default(false),
            })
            .parse(await request.json());
          const [provider] = await db
            .select({ id: providers.id })
            .from(providers)
            .where(
              and(
                eq(providers.id, input.providerId),
                eq(providers.userId, user.id),
              ),
            )
            .limit(1);
          if (!provider) throw new HttpError(404, "Provider not found");
          if (input.isDefault)
            await db
              .update(models)
              .set({ isDefault: false })
              .where(eq(models.userId, user.id));
          const [model] = await db
            .insert(models)
            .values({
              userId: user.id,
              providerId: input.providerId,
              modelId: input.modelId,
              name: input.name,
              capabilities: { reasoning: input.reasoning, tools: input.tools },
              isDefault: input.isDefault,
            })
            .returning();
          return Response.json({ model }, { status: 201 });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(400, error.issues[0]?.message ?? "Invalid model")
              : error,
          );
        }
      },
      PATCH: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const input = z
            .object({
              id: z.string(),
              name: z.string().trim().min(1).max(200).optional(),
              enabled: z.boolean().optional(),
              isDefault: z.boolean().optional(),
            })
            .parse(await request.json());
          const [current] = await db
            .select()
            .from(models)
            .where(and(eq(models.id, input.id), eq(models.userId, user.id)))
            .limit(1);
          if (!current) throw new HttpError(404, "Model not found");
          if (input.isDefault)
            await db
              .update(models)
              .set({ isDefault: false })
              .where(eq(models.userId, user.id));
          const [model] = await db
            .update(models)
            .set({
              name: input.name,
              enabled: input.enabled,
              isDefault: input.isDefault,
              updatedAt: new Date(),
            })
            .where(eq(models.id, current.id))
            .returning();
          return Response.json({ model });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(400, error.issues[0]?.message ?? "Invalid model")
              : error,
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const id = new URL(request.url).searchParams.get("id");
          if (!id) throw new HttpError(400, "Model ID is required");
          const [model] = await db
            .select()
            .from(models)
            .where(and(eq(models.id, id), eq(models.userId, user.id)))
            .limit(1);
          if (!model) throw new HttpError(404, "Model not found");
          await db.delete(models).where(eq(models.id, id));
          return new Response(null, { status: 204 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
