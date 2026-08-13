import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createFileRoute } from "@tanstack/react-router";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import {
  convertToModelMessages,
  detectToolDrift,
  fingerprintTools,
  isStepCount,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { sessionFromRequest } from "@/server/auth";
import { decryptSecret } from "@/server/crypto";
import { db } from "@/server/db";
import { HttpError, assertSafeOutboundUrl, jsonError } from "@/server/http";
import {
  chatMcpServers,
  chats,
  mcpServers,
  messages,
  models,
  providers,
} from "@/server/schema";

const bodySchema = z.object({
  chatId: z.string(),
  message: z
    .object({
      id: z.string().optional(),
      role: z.literal("user"),
      parts: z.array(z.record(z.string(), z.unknown())).min(1),
    })
    .optional(),
  regenerate: z.boolean().default(false),
});

function textFrom(parts: Array<Record<string, unknown>>) {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join(" ")
    .trim();
}

function titleFrom(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 58
    ? `${normalized.slice(0, 57)}…`
    : normalized || "New conversation";
}

function finalParts(event: {
  steps: Array<{
    reasoningText?: string;
    text: string;
    toolCalls: Array<{ toolName: string; input: unknown; toolCallId: string }>;
    toolResults: Array<{
      toolName: string;
      output: unknown;
      toolCallId: string;
    }>;
  }>;
}) {
  const parts: Array<Record<string, unknown>> = [];
  for (const step of event.steps) {
    if (step.reasoningText)
      parts.push({
        type: "reasoning",
        text: step.reasoningText,
        state: "done",
      });
    for (const call of step.toolCalls) {
      const result = step.toolResults.find(
        (item) => item.toolCallId === call.toolCallId,
      );
      parts.push({
        type: "dynamic-tool",
        toolName: call.toolName,
        toolCallId: call.toolCallId,
        state: result ? "output-available" : "output-error",
        input: call.input,
        output: result?.output,
        errorText: result ? undefined : "Tool did not return a result",
      });
    }
    if (step.text) parts.push({ type: "text", text: step.text, state: "done" });
  }
  return parts.length ? parts : [{ type: "text", text: "", state: "done" }];
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clients: MCPClient[] = [];
        let assistantId: string | undefined;
        try {
          const { user } = await sessionFromRequest(request);
          const body = bodySchema.parse(await request.json());
          const [chat] = await db
            .select()
            .from(chats)
            .where(and(eq(chats.id, body.chatId), eq(chats.userId, user.id)))
            .limit(1);
          if (!chat) throw new HttpError(404, "Conversation not found");
          const [selected] = await db
            .select({ model: models, provider: providers })
            .from(models)
            .innerJoin(providers, eq(models.providerId, providers.id))
            .where(
              and(
                eq(models.id, chat.modelId ?? ""),
                eq(models.userId, user.id),
                eq(models.enabled, true),
                eq(providers.enabled, true),
              ),
            )
            .limit(1);
          if (!selected)
            throw new HttpError(
              400,
              "Choose an enabled model before sending a message",
              "model_required",
            );

          const [positionResult] = await db
            .select({ value: max(messages.position) })
            .from(messages)
            .where(eq(messages.chatId, chat.id));
          let position = (positionResult?.value ?? -1) + 1;
          if (body.regenerate) {
            const [last] = await db
              .select()
              .from(messages)
              .where(
                and(eq(messages.chatId, chat.id), eq(messages.userId, user.id)),
              )
              .orderBy(desc(messages.position))
              .limit(1);
            if (last?.role === "assistant") {
              await db.delete(messages).where(eq(messages.id, last.id));
              position = last.position;
            }
          } else if (body.message) {
            await db.insert(messages).values({
              id: body.message.id ?? crypto.randomUUID(),
              chatId: chat.id,
              userId: user.id,
              role: "user",
              parts: body.message.parts,
              position,
            });
            if (chat.title === "New conversation")
              await db
                .update(chats)
                .set({
                  title: titleFrom(textFrom(body.message.parts)),
                  updatedAt: new Date(),
                })
                .where(eq(chats.id, chat.id));
            position += 1;
          } else throw new HttpError(400, "A message is required");

          const history = await db
            .select()
            .from(messages)
            .where(
              and(eq(messages.chatId, chat.id), eq(messages.userId, user.id)),
            )
            .orderBy(asc(messages.position));
          if (!history.length)
            throw new HttpError(400, "There is no message to regenerate");
          const uiMessages = history.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
          })) as UIMessage[];

          const headers = selected.provider.headersEnvelope
            ? (JSON.parse(
                decryptSecret(selected.provider.headersEnvelope) ?? "{}",
              ) as Record<string, string>)
            : {};
          const apiKey =
            decryptSecret(selected.provider.secretEnvelope) ?? undefined;
          await assertSafeOutboundUrl(selected.provider.baseUrl);
          const provider = createOpenAICompatible({
            name:
              selected.provider.name.replace(/[^a-z0-9]/gi, "") || "compatible",
            baseURL: selected.provider.baseUrl,
            apiKey,
            headers,
            includeUsage: true,
          });

          const tools: ToolSet = {};
          const selectedIds = (
            await db
              .select({ id: chatMcpServers.mcpServerId })
              .from(chatMcpServers)
              .where(eq(chatMcpServers.chatId, chat.id))
          ).map((row) => row.id);
          if (selectedIds.length) {
            const servers = await db
              .select()
              .from(mcpServers)
              .where(
                and(
                  eq(mcpServers.userId, user.id),
                  eq(mcpServers.enabled, true),
                  eq(mcpServers.trustRequired, false),
                  inArray(mcpServers.id, selectedIds),
                ),
              );
            for (const server of servers.slice(0, 8)) {
              await assertSafeOutboundUrl(server.url);
              const mcpHeaders = server.headersEnvelope
                ? (JSON.parse(
                    decryptSecret(server.headersEnvelope) ?? "{}",
                  ) as Record<string, string>)
                : {};
              const client = await createMCPClient({
                transport: {
                  type: server.transport as "http" | "sse",
                  url: server.url,
                  headers: mcpHeaders,
                  redirect: "error",
                },
                maxRetries: 0,
              });
              clients.push(client);
              const discovered = await client.tools();
              const current = await fingerprintTools(discovered);
              const drift = detectToolDrift(
                current,
                server.trustedFingerprint ?? {},
              );
              if (drift.added.length || drift.changed.length) {
                await db
                  .update(mcpServers)
                  .set({
                    trustRequired: true,
                    lastTestMessage:
                      "Tool definitions changed; review and trust them again",
                  })
                  .where(eq(mcpServers.id, server.id));
                throw new HttpError(
                  409,
                  `MCP server “${server.name}” changed its tools and must be trusted again`,
                  "mcp_drift",
                );
              }
              const prefix =
                server.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")
                  .slice(0, 24) || "mcp";
              for (const [name, tool] of Object.entries(discovered).slice(
                0,
                40,
              ))
                tools[`${prefix}__${name}`] = tool;
            }
          }

          assistantId = crypto.randomUUID();
          await db.insert(messages).values({
            id: assistantId,
            chatId: chat.id,
            userId: user.id,
            role: "assistant",
            parts: [],
            status: "streaming",
            position,
          });
          const closeClients = async () => {
            await Promise.allSettled(clients.map((client) => client.close()));
          };
          const result = streamText({
            model: provider(selected.model.modelId),
            messages: await convertToModelMessages(uiMessages, {
              tools,
              ignoreIncompleteToolCalls: true,
            }),
            tools,
            stopWhen: isStepCount(8),
            abortSignal: request.signal,
            onEnd: async (event) => {
              await db
                .update(messages)
                .set({
                  parts: finalParts(event),
                  status: "complete",
                  metadata: {
                    finishReason: event.finishReason,
                    usage: event.usage,
                    model: selected.model.modelId,
                  },
                })
                .where(eq(messages.id, assistantId!));
              await db
                .update(chats)
                .set({ updatedAt: new Date() })
                .where(eq(chats.id, chat.id));
              await closeClients();
            },
            onAbort: async () => {
              await db
                .update(messages)
                .set({
                  status: "interrupted",
                  parts: [
                    { type: "text", text: "Response stopped.", state: "done" },
                  ],
                })
                .where(eq(messages.id, assistantId!));
              await closeClients();
            },
            onError: async () => {
              await db
                .update(messages)
                .set({
                  status: "error",
                  parts: [
                    {
                      type: "text",
                      text: "The model could not complete this response.",
                      state: "done",
                    },
                  ],
                })
                .where(eq(messages.id, assistantId!));
              await closeClients();
            },
          });
          return result.toUIMessageStreamResponse({
            generateMessageId: () => assistantId!,
          });
        } catch (error) {
          await Promise.allSettled(clients.map((client) => client.close()));
          if (assistantId)
            await db
              .update(messages)
              .set({ status: "error" })
              .where(eq(messages.id, assistantId))
              .catch(() => undefined);
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid chat request",
                )
              : error,
          );
        }
      },
    },
  },
});
