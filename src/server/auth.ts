import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { decryptSecret } from "./crypto";
import { env } from "./env";
import { HttpError } from "./http";
import * as schema from "./schema";

type OidcConfig = {
  providerKey?: string;
  label?: string;
  issuer?: string;
  discoveryUrl?: string;
  clientId?: string;
  scopes?: string;
  autoProvision?: boolean;
  linkByEmail?: boolean;
  allowedDomains?: string[];
};

let runtime: { revision: number; auth: ReturnType<typeof buildAuth> } | null =
  null;

function buildAuth(oidc?: OidcConfig & { clientSecret: string }) {
  return betterAuth({
    secret: env().BETTER_AUTH_SECRET,
    baseURL: new URL("/api/auth", env().BASE_URL).toString(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    account: {
      accountLinking: {
        enabled: oidc?.linkByEmail === true,
        trustedProviders: oidc ? [oidc.providerKey ?? "oidc"] : [],
      },
    },
    user: {
      additionalFields: {
        role: {
          type: ["user", "admin"],
          required: false,
          defaultValue: "user",
          input: false,
          returned: true,
        },
        enabled: {
          type: "boolean",
          required: false,
          defaultValue: true,
          input: false,
          returned: true,
        },
        mustChangePassword: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
          returned: true,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const [state] = await db
              .select({
                setupCompletedAt: schema.installation.setupCompletedAt,
              })
              .from(schema.installation)
              .where(eq(schema.installation.id, "main"))
              .limit(1);
            if (!state?.setupCompletedAt || !oidc?.autoProvision)
              throw new HttpError(
                403,
                "Public registration is disabled",
                "registration_disabled",
              );
            const email = user.email.trim().toLowerCase();
            const domain = email.split("@")[1] ?? "";
            if (
              oidc.allowedDomains?.length &&
              !oidc.allowedDomains.includes(domain)
            )
              throw new HttpError(
                403,
                "Your email domain is not allowed",
                "domain_not_allowed",
              );
            return { data: { ...user, email, role: "user", enabled: true } };
          },
        },
      },
    },
    plugins: [
      ...(oidc
        ? [
            genericOAuth({
              config: [
                {
                  providerId: oidc.providerKey ?? "oidc",
                  discoveryUrl:
                    oidc.discoveryUrl ||
                    `${oidc.issuer?.replace(/\/$/, "")}/.well-known/openid-configuration`,
                  clientId: oidc.clientId ?? "",
                  clientSecret: oidc.clientSecret,
                  scopes: (oidc.scopes || "openid profile email").split(/\s+/),
                  pkce: true,
                  disableImplicitSignUp:
                    !oidc.autoProvision && !oidc.linkByEmail,
                  disableSignUp: !oidc.autoProvision,
                  mapProfileToUser: (profile: Record<string, unknown>) => ({
                    email:
                      typeof profile.email === "string"
                        ? profile.email.trim().toLowerCase()
                        : undefined,
                    emailVerified: profile.email_verified === true,
                    name:
                      typeof profile.name === "string"
                        ? profile.name
                        : undefined,
                    image:
                      typeof profile.picture === "string"
                        ? profile.picture
                        : undefined,
                  }),
                },
              ],
            }),
          ]
        : []),
      tanstackStartCookies(),
    ],
  });
}

export const auth = buildAuth();

export async function getRuntimeAuth() {
  const [state] = await db
    .select()
    .from(schema.installation)
    .where(eq(schema.installation.id, "main"))
    .limit(1);
  if (!state?.oidcEnabled || !state.oidcSecretEnvelope) return auth;
  if (runtime?.revision === state.revision) return runtime.auth;
  const config = state.oidcConfig as OidcConfig;
  runtime = {
    revision: state.revision,
    auth: buildAuth({
      ...config,
      clientSecret: decryptSecret(state.oidcSecretEnvelope) ?? "",
    }),
  };
  return runtime.auth;
}

export async function sessionFromRequest(request: Request) {
  const instance = await getRuntimeAuth();
  const session = await instance.api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "Sign in is required", "unauthorized");
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user?.enabled)
    throw new HttpError(403, "This account is disabled", "account_disabled");
  return {
    ...session,
    user: {
      ...session.user,
      role: user.role,
      enabled: user.enabled,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function adminFromRequest(request: Request) {
  const session = await sessionFromRequest(request);
  if (session.user.role !== "admin")
    throw new HttpError(403, "Administrator access is required", "forbidden");
  return session;
}
