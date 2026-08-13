import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  SETTINGS_ENCRYPTION_KEY: z.string().min(32),
  BASE_URL: z.string().url().default("http://localhost:3000"),
  SETUP_CLAIM_TOKEN: z.string().min(16).optional(),
  ALLOW_PRIVATE_EGRESS: z.enum(["true", "false"]).default("false"),
  ALLOW_INSECURE_HTTP: z.enum(["true", "false"]).default("false"),
});

let value: z.infer<typeof schema> | undefined;
export function env() {
  if (!value) value = schema.parse(process.env);
  return value;
}
