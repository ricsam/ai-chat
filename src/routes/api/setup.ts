import { createFileRoute } from "@tanstack/react-router";
import { hashPassword } from "better-auth/crypto";
import { serializeSignedCookie } from "better-call";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, jsonError } from "@/server/http";
import { safeTokenEqual } from "@/server/crypto";
import { accounts, installation, users } from "@/server/schema";

const inputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine(
      (value) => /[a-z]/i.test(value) && /\d/.test(value),
      "Password must contain a letter and a number",
    ),
  claimToken: z.string().optional(),
});

export const Route = createFileRoute("/api/setup")({
  server: {
    handlers: {
      GET: async () => {
        const [state] = await db
          .select({ completedAt: installation.setupCompletedAt })
          .from(installation)
          .where(eq(installation.id, "main"))
          .limit(1);
        const [userCount] = await db.select({ value: count() }).from(users);
        return Response.json({
          required: !state?.completedAt && (userCount?.value ?? 0) === 0,
          claimRequired: Boolean(env().SETUP_CLAIM_TOKEN),
        });
      },
      POST: async ({ request }) => {
        const requestId =
          request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const input = inputSchema.parse(await request.json());
          if (
            !safeTokenEqual(
              env().SETUP_CLAIM_TOKEN,
              input.claimToken ?? request.headers.get("x-setup-claim-token"),
            )
          )
            throw new HttpError(
              403,
              "The setup claim token is invalid",
              "invalid_claim",
            );
          const password = await hashPassword(input.password);
          const user = await db.transaction(async (tx) => {
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtext('ai-chat:first-setup'))`,
            );
            const [state] = await tx
              .select()
              .from(installation)
              .where(eq(installation.id, "main"))
              .limit(1)
              .for("update");
            const [userCount] = await tx.select({ value: count() }).from(users);
            if (state?.setupCompletedAt || (userCount?.value ?? 0) > 0)
              throw new HttpError(
                409,
                "Installation setup is already complete",
                "setup_closed",
              );
            const id = crypto.randomUUID();
            const now = new Date();
            await tx.insert(users).values({
              id,
              name: input.name,
              email: input.email,
              emailVerified: true,
              role: "admin",
              enabled: true,
              mustChangePassword: false,
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
            await tx
              .update(installation)
              .set({
                setupCompletedAt: now,
                revision: (state?.revision ?? 0) + 1,
                updatedAt: now,
              })
              .where(eq(installation.id, "main"));
            return { id, name: input.name, email: input.email };
          });
          await audit({
            actorId: user.id,
            action: "installation.setup.completed",
            targetType: "user",
            targetId: user.id,
            requestId,
          });
          const context = await auth.$context;
          const session = await context.internalAdapter.createSession(
            user.id as `${string}-${string}-${string}-${string}-${string}`,
            false,
          );
          const cookie = context.authCookies.sessionToken;
          const setCookie = await serializeSignedCookie(
            cookie.name,
            session.token,
            context.secret,
            cookie.attributes,
          );
          return Response.json(
            { user, next: "/chat" },
            {
              status: 201,
              headers: { "set-cookie": setCookie, "x-request-id": requestId },
            },
          );
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(400, error.issues[0]?.message ?? "Invalid setup")
              : error,
            requestId,
          );
        }
      },
    },
  },
});
