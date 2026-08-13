import { createFileRoute } from "@tanstack/react-router";
import { hashPassword } from "better-auth/crypto";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { adminFromRequest } from "@/server/auth";
import { db } from "@/server/db";
import { HttpError, jsonError } from "@/server/http";
import { accounts, sessions, users } from "@/server/schema";
import { audit } from "@/server/audit";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await adminFromRequest(request);
          return Response.json({
            users: await db.select().from(users).orderBy(users.createdAt),
          });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await adminFromRequest(request);
          const input = z
            .object({
              name: z.string().trim().min(2).max(100),
              email: z
                .string()
                .trim()
                .email()
                .transform((v) => v.toLowerCase()),
              password: z.string().min(12).max(128),
              role: z.enum(["user", "admin"]).default("user"),
            })
            .parse(await request.json());
          const id = crypto.randomUUID();
          const now = new Date();
          const password = await hashPassword(input.password);
          await db.transaction(async (tx) => {
            await tx.insert(users).values({
              id,
              name: input.name,
              email: input.email,
              emailVerified: true,
              role: input.role,
              enabled: true,
              mustChangePassword: true,
              createdAt: now,
              updatedAt: now,
            });
            await tx.insert(accounts).values({
              id: crypto.randomUUID(),
              accountId: id,
              providerId: "credential",
              userId: id,
              password,
              createdAt: now,
              updatedAt: now,
            });
          });
          await audit({
            actorId: session.user.id,
            action: "user.created",
            targetType: "user",
            targetId: id,
          });
          return Response.json({ id }, { status: 201 });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(400, error.issues[0]?.message ?? "Invalid user")
              : error,
          );
        }
      },
      PATCH: async ({ request }) => {
        try {
          const session = await adminFromRequest(request);
          const input = z
            .object({
              id: z.string(),
              name: z.string().trim().min(2).max(100).optional(),
              role: z.enum(["user", "admin"]).optional(),
              enabled: z.boolean().optional(),
              password: z.string().min(12).max(128).optional(),
            })
            .parse(await request.json());
          const [target] = await db
            .select()
            .from(users)
            .where(eq(users.id, input.id))
            .limit(1);
          if (!target) throw new HttpError(404, "User not found");
          if (
            target.id === session.user.id &&
            (input.enabled === false || input.role === "user")
          )
            throw new HttpError(
              400,
              "You cannot disable or demote your own account",
            );
          if (
            target.role === "admin" &&
            target.enabled &&
            (input.enabled === false || input.role === "user")
          ) {
            const [admins] = await db
              .select({ value: count() })
              .from(users)
              .where(and(eq(users.role, "admin"), eq(users.enabled, true)));
            if ((admins?.value ?? 0) <= 1)
              throw new HttpError(
                400,
                "The final enabled administrator cannot be changed",
              );
          }
          await db.transaction(async (tx) => {
            await tx
              .update(users)
              .set({
                name: input.name,
                role: input.role,
                enabled: input.enabled,
                mustChangePassword: input.password ? true : undefined,
                updatedAt: new Date(),
              })
              .where(eq(users.id, target.id));
            if (input.password)
              await tx
                .update(accounts)
                .set({
                  password: await hashPassword(input.password),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(accounts.userId, target.id),
                    eq(accounts.providerId, "credential"),
                  ),
                );
            if (input.enabled === false)
              await tx.delete(sessions).where(eq(sessions.userId, target.id));
          });
          await audit({
            actorId: session.user.id,
            action: "user.updated",
            targetType: "user",
            targetId: target.id,
          });
          return Response.json({ ok: true });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(400, error.issues[0]?.message ?? "Invalid user")
              : error,
          );
        }
      },
    },
  },
});
