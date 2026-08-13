import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { installation } from "@/server/schema";

export const Route = createFileRoute("/api/public-config")({
  server: {
    handlers: {
      GET: async () => {
        const [state] = await db
          .select()
          .from(installation)
          .where(eq(installation.id, "main"))
          .limit(1);
        return Response.json(
          {
            setup: {
              required: !state?.setupCompletedAt,
              claimRequired: Boolean(env().SETUP_CLAIM_TOKEN),
            },
            brand: {
              name: state?.productName ?? "Nimbus",
              tagline: state?.tagline ?? "A thoughtful place to think with AI",
              logo: state?.logoDataUrl,
              favicon: state?.faviconDataUrl,
              primaryColor: state?.primaryColor ?? "#6d5bd0",
              primaryForegroundColor:
                state?.primaryForegroundColor ?? "#ffffff",
            },
            auth: {
              oidcEnabled: state?.oidcEnabled ?? false,
              oidcLabel:
                (state?.oidcConfig as { label?: string } | undefined)?.label ??
                "Single sign-on",
              providerKey:
                (state?.oidcConfig as { providerKey?: string } | undefined)
                  ?.providerKey ?? "oidc",
            },
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
