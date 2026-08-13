import { createFileRoute } from "@tanstack/react-router";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { sessionFromRequest } from "@/server/auth";
import { db } from "@/server/db";
import { HttpError, jsonError } from "@/server/http";
import {
  chatMcpServers,
  chats,
  mcpServers,
  messages,
  models,
} from "@/server/schema";

async function owned(userId: string, id: string) {
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.userId, userId)))
    .limit(1);
  if (!chat) throw new HttpError(404, "Conversation not found", "not_found");
  return chat;
}

export const Route = createFileRoute("/api/chats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const id = new URL(request.url).searchParams.get("id");
          if (id) {
            const chat = await owned(user.id, id);
            const chatMessages = await db
              .select()
              .from(messages)
              .where(
                and(eq(messages.chatId, chat.id), eq(messages.userId, user.id)),
              )
              .orderBy(asc(messages.position));
            const selected = await db
              .select({ id: chatMcpServers.mcpServerId })
              .from(chatMcpServers)
              .where(eq(chatMcpServers.chatId, chat.id));
            return Response.json({
              chat,
              messages: chatMessages,
              mcpServerIds: selected.map((row) => row.id),
            });
          }
          const rows = await db
            .select()
            .from(chats)
            .where(and(eq(chats.userId, user.id), eq(chats.archived, false)))
            .orderBy(desc(chats.updatedAt));
          return Response.json({ chats: rows });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const body = z
            .object({
              modelId: z.string().optional(),
              mcpServerIds: z.array(z.string()).max(8).default([]),
            })
            .parse(await request.json().catch(() => ({})));
          let modelId = body.modelId;
          if (!modelId)
            modelId = (
              await db
                .select({ id: models.id })
                .from(models)
                .where(
                  and(eq(models.userId, user.id), eq(models.enabled, true)),
                )
                .orderBy(desc(models.isDefault))
                .limit(1)
            )[0]?.id;
          if (
            modelId &&
            !(
              await db
                .select({ id: models.id })
                .from(models)
                .where(and(eq(models.id, modelId), eq(models.userId, user.id)))
                .limit(1)
            )[0]
          )
            throw new HttpError(400, "Select one of your models");
          if (body.mcpServerIds.length) {
            const ownedServers = await db
              .select({ id: mcpServers.id })
              .from(mcpServers)
              .where(
                and(
                  eq(mcpServers.userId, user.id),
                  inArray(mcpServers.id, body.mcpServerIds),
                ),
              );
            if (ownedServers.length !== body.mcpServerIds.length)
              throw new HttpError(
                400,
                "One or more MCP servers are unavailable",
              );
          }
          const [chat] = await db
            .insert(chats)
            .values({ userId: user.id, modelId })
            .returning();
          if (chat && body.mcpServerIds.length)
            await db.insert(chatMcpServers).values(
              body.mcpServerIds.map((mcpServerId) => ({
                chatId: chat.id,
                mcpServerId,
              })),
            );
          return Response.json({ chat }, { status: 201 });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid conversation",
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
              title: z.string().trim().min(1).max(120).optional(),
              modelId: z.string().nullable().optional(),
              mcpServerIds: z.array(z.string()).max(8).optional(),
            })
            .parse(await request.json());
          const current = await owned(user.id, body.id);
          if (
            body.modelId &&
            !(
              await db
                .select({ id: models.id })
                .from(models)
                .where(
                  and(eq(models.id, body.modelId), eq(models.userId, user.id)),
                )
                .limit(1)
            )[0]
          )
            throw new HttpError(400, "Select one of your models");
          if (body.mcpServerIds) {
            const ownedServers = body.mcpServerIds.length
              ? await db
                  .select({ id: mcpServers.id })
                  .from(mcpServers)
                  .where(
                    and(
                      eq(mcpServers.userId, user.id),
                      inArray(mcpServers.id, body.mcpServerIds),
                    ),
                  )
              : [];
            if (ownedServers.length !== body.mcpServerIds.length)
              throw new HttpError(
                400,
                "One or more MCP servers are unavailable",
              );
            await db.transaction(async (tx) => {
              await tx
                .delete(chatMcpServers)
                .where(eq(chatMcpServers.chatId, current.id));
              if (body.mcpServerIds?.length)
                await tx.insert(chatMcpServers).values(
                  body.mcpServerIds.map((mcpServerId) => ({
                    chatId: current.id,
                    mcpServerId,
                  })),
                );
            });
          }
          const [chat] = await db
            .update(chats)
            .set({
              title: body.title,
              modelId: body.modelId,
              updatedAt: new Date(),
            })
            .where(eq(chats.id, current.id))
            .returning();
          return Response.json({ chat });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid conversation",
                )
              : error,
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { user } = await sessionFromRequest(request);
          const id = new URL(request.url).searchParams.get("id");
          if (!id) throw new HttpError(400, "Conversation ID is required");
          await owned(user.id, id);
          await db.delete(chats).where(eq(chats.id, id));
          return new Response(null, { status: 204 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
