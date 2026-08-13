CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "role" text DEFAULT 'user' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_role_check" CHECK ("role" in ('user', 'admin'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_normalized_unique" ON "user" (lower("email"));

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_subject_unique" ON "account" ("provider_id", "account_id");
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz,
  "updated_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "installation" (
  "id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
  "setup_completed_at" timestamptz,
  "oidc_enabled" boolean DEFAULT false NOT NULL,
  "oidc_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "oidc_secret_envelope" text,
  "product_name" text DEFAULT 'Nimbus' NOT NULL,
  "tagline" text DEFAULT 'A thoughtful place to think with AI' NOT NULL,
  "logo_data_url" text,
  "favicon_data_url" text,
  "primary_color" text DEFAULT '#6d5bd0' NOT NULL,
  "primary_foreground_color" text DEFAULT '#ffffff' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "installation_singleton_check" CHECK ("id" = 'main')
);
INSERT INTO "installation" ("id") VALUES ('main') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "providers" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "base_url" text NOT NULL,
  "secret_envelope" text,
  "headers_envelope" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_tested_at" timestamptz,
  "last_test_succeeded" boolean,
  "last_test_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "providers_user_id_idx" ON "providers" ("user_id");

CREATE TABLE IF NOT EXISTS "models" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "provider_id" text NOT NULL REFERENCES "providers"("id") ON DELETE cascade,
  "model_id" text NOT NULL,
  "name" text NOT NULL,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "models_provider_model_unique" ON "models" ("provider_id", "model_id");
CREATE INDEX IF NOT EXISTS "models_user_id_idx" ON "models" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "models_one_default_per_user" ON "models" ("user_id") WHERE "is_default" = true;

CREATE TABLE IF NOT EXISTS "mcp_servers" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "transport" text DEFAULT 'http' NOT NULL,
  "headers_envelope" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "trusted_fingerprint" jsonb,
  "discovered_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "trust_required" boolean DEFAULT true NOT NULL,
  "last_tested_at" timestamptz,
  "last_test_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_transport_check" CHECK ("transport" in ('http', 'sse'))
);
CREATE INDEX IF NOT EXISTS "mcp_servers_user_id_idx" ON "mcp_servers" ("user_id");

CREATE TABLE IF NOT EXISTS "chats" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "title" text DEFAULT 'New conversation' NOT NULL,
  "model_id" text REFERENCES "models"("id") ON DELETE set null,
  "archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "chats_user_updated_idx" ON "chats" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "chat_mcp_servers" (
  "chat_id" text NOT NULL REFERENCES "chats"("id") ON DELETE cascade,
  "mcp_server_id" text NOT NULL REFERENCES "mcp_servers"("id") ON DELETE cascade,
  PRIMARY KEY ("chat_id", "mcp_server_id")
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" text PRIMARY KEY NOT NULL,
  "chat_id" text NOT NULL REFERENCES "chats"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'complete' NOT NULL,
  "position" integer NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "message_role_check" CHECK ("role" in ('user', 'assistant', 'system'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "messages_chat_position_unique" ON "messages" ("chat_id", "position");
CREATE INDEX IF NOT EXISTS "messages_chat_id_idx" ON "messages" ("chat_id");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_id" text,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "request_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx" ON "audit_events" ("created_at");
