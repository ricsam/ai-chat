import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminFromRequest } from "@/server/auth";
import { encryptSecret } from "@/server/crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, jsonError, safeFetch } from "@/server/http";
import { installation } from "@/server/schema";
import { audit } from "@/server/audit";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const dataImage = z
  .string()
  .max(300_000)
  .refine(
    (value) =>
      value === "" ||
      /^data:image\/(png|jpeg|webp|svg\+xml|x-icon);base64,/i.test(value),
    "Upload a PNG, JPEG, WebP, SVG, or icon file",
  );
const inputSchema = z.object({
  brand: z
    .object({
      productName: z.string().trim().min(1).max(60),
      tagline: z.string().trim().max(140),
      logoDataUrl: dataImage.optional(),
      faviconDataUrl: dataImage.optional(),
      primaryColor: color,
      primaryForegroundColor: color,
    })
    .optional(),
  oidc: z
    .object({
      enabled: z.boolean(),
      providerKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}$/),
      label: z.string().trim().min(1).max(60),
      issuer: z.string().url(),
      discoveryUrl: z.string().url().optional().or(z.literal("")),
      clientId: z.string().trim().min(1),
      clientSecret: z.string().optional(),
      scopes: z.string().default("openid profile email"),
      autoProvision: z.boolean().default(false),
      linkByEmail: z.boolean().default(false),
      allowedDomains: z
        .array(z.string().trim().toLowerCase())
        .max(50)
        .default([]),
    })
    .optional(),
});

export const Route = createFileRoute("/api/admin/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await adminFromRequest(request);
          const [state] = await db
            .select()
            .from(installation)
            .where(eq(installation.id, "main"))
            .limit(1);
          return Response.json({
            brand: state && {
              productName: state.productName,
              tagline: state.tagline,
              logoDataUrl: state.logoDataUrl,
              faviconDataUrl: state.faviconDataUrl,
              primaryColor: state.primaryColor,
              primaryForegroundColor: state.primaryForegroundColor,
            },
            oidc: state && {
              ...(state.oidcConfig as object),
              enabled: state.oidcEnabled,
              hasSecret: Boolean(state.oidcSecretEnvelope),
              callbackUrl: new URL(
                `/api/auth/oauth2/callback/${(state.oidcConfig as { providerKey?: string }).providerKey ?? "oidc"}`,
                env().BASE_URL,
              ).toString(),
            },
          });
        } catch (error) {
          return jsonError(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const session = await adminFromRequest(request);
          const input = inputSchema.parse(await request.json());
          const [state] = await db
            .select()
            .from(installation)
            .where(eq(installation.id, "main"))
            .limit(1);
          if (!state) throw new HttpError(500, "Installation state is missing");
          await db
            .update(installation)
            .set({
              productName: input.brand?.productName,
              tagline: input.brand?.tagline,
              logoDataUrl:
                input.brand?.logoDataUrl === undefined
                  ? undefined
                  : input.brand.logoDataUrl || null,
              faviconDataUrl:
                input.brand?.faviconDataUrl === undefined
                  ? undefined
                  : input.brand.faviconDataUrl || null,
              primaryColor: input.brand?.primaryColor,
              primaryForegroundColor: input.brand?.primaryForegroundColor,
              oidcEnabled: input.oidc?.enabled,
              oidcConfig: input.oidc
                ? {
                    providerKey: input.oidc.providerKey,
                    label: input.oidc.label,
                    issuer: input.oidc.issuer,
                    discoveryUrl: input.oidc.discoveryUrl,
                    clientId: input.oidc.clientId,
                    scopes: input.oidc.scopes,
                    autoProvision: input.oidc.autoProvision,
                    linkByEmail: input.oidc.linkByEmail,
                    allowedDomains: input.oidc.allowedDomains,
                  }
                : undefined,
              oidcSecretEnvelope: input.oidc?.clientSecret
                ? encryptSecret(input.oidc.clientSecret)
                : state.oidcSecretEnvelope,
              revision: state.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(installation.id, "main"));
          await audit({
            actorId: session.user.id,
            action: input.oidc ? "oidc.updated" : "branding.updated",
            targetType: "installation",
            targetId: "main",
          });
          return Response.json({ ok: true });
        } catch (error) {
          return jsonError(
            error instanceof z.ZodError
              ? new HttpError(
                  400,
                  error.issues[0]?.message ?? "Invalid configuration",
                )
              : error,
          );
        }
      },
    },
  },
});

export async function testOidc(request: Request) {
  await adminFromRequest(request);
  const [state] = await db
    .select()
    .from(installation)
    .where(eq(installation.id, "main"))
    .limit(1);
  const config = state?.oidcConfig as
    { issuer?: string; discoveryUrl?: string } | undefined;
  if (!config?.issuer) throw new HttpError(400, "Save the OIDC issuer first");
  const discovery =
    config.discoveryUrl ||
    `${config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await safeFetch(discovery);
  if (!response.ok)
    throw new HttpError(400, `Discovery returned HTTP ${response.status}`);
  const metadata = (await response.json()) as {
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
  };
  if (metadata.issuer !== config.issuer)
    throw new HttpError(
      400,
      "Discovery issuer does not exactly match the configured issuer",
    );
  if (!metadata.authorization_endpoint || !metadata.token_endpoint)
    throw new HttpError(
      400,
      "Discovery metadata is missing required endpoints",
    );
  return { message: "OIDC discovery is valid", issuer: metadata.issuer };
}
