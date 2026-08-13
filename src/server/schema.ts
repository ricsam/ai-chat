import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    enabled: boolean("enabled").notNull().default(true),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_email_normalized_unique").on(sql`lower(${table.email})`),
    check("user_role_check", sql`${table.role} in ('user', 'admin')`),
  ],
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("account_provider_subject_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const installation = pgTable(
  "installation",
  {
    id: text("id").primaryKey().default("main"),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    oidcEnabled: boolean("oidc_enabled").notNull().default(false),
    oidcConfig: jsonb("oidc_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    oidcSecretEnvelope: text("oidc_secret_envelope"),
    productName: text("product_name").notNull().default("Nimbus"),
    tagline: text("tagline")
      .notNull()
      .default("A thoughtful place to think with AI"),
    logoDataUrl: text("logo_data_url"),
    faviconDataUrl: text("favicon_data_url"),
    primaryColor: text("primary_color").notNull().default("#6d5bd0"),
    primaryForegroundColor: text("primary_foreground_color")
      .notNull()
      .default("#ffffff"),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (table) => [check("installation_singleton_check", sql`${table.id} = 'main'`)],
);

export const providers = pgTable(
  "providers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    secretEnvelope: text("secret_envelope"),
    headersEnvelope: text("headers_envelope"),
    enabled: boolean("enabled").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestSucceeded: boolean("last_test_succeeded"),
    lastTestMessage: text("last_test_message"),
    ...timestamps,
  },
  (table) => [index("providers_user_id_idx").on(table.userId)],
);

export const models = pgTable(
  "models",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    name: text("name").notNull(),
    capabilities: jsonb("capabilities")
      .$type<{ reasoning?: boolean; tools?: boolean }>()
      .notNull()
      .default({}),
    enabled: boolean("enabled").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("models_provider_model_unique").on(
      table.providerId,
      table.modelId,
    ),
    index("models_user_id_idx").on(table.userId),
  ],
);

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    transport: text("transport").notNull().default("http"),
    headersEnvelope: text("headers_envelope"),
    enabled: boolean("enabled").notNull().default(true),
    trustedFingerprint: jsonb("trusted_fingerprint").$type<
      Record<string, string>
    >(),
    discoveredTools: jsonb("discovered_tools")
      .$type<Array<{ name: string; description?: string }>>()
      .notNull()
      .default([]),
    trustRequired: boolean("trust_required").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestMessage: text("last_test_message"),
    ...timestamps,
  },
  (table) => [index("mcp_servers_user_id_idx").on(table.userId)],
);

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    modelId: text("model_id").references(() => models.id, {
      onDelete: "set null",
    }),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("chats_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const chatMcpServers = pgTable(
  "chat_mcp_servers",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    mcpServerId: text("mcp_server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.mcpServerId] })],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("complete"),
    position: integer("position").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_chat_position_unique").on(
      table.chatId,
      table.position,
    ),
    index("messages_chat_id_idx").on(table.chatId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("audit_events_created_at_idx").on(table.createdAt)],
);
