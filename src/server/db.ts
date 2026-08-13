import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "./env";
import * as schema from "./schema";

const globalState = globalThis as typeof globalThis & {
  __aiChatPool?: pg.Pool;
};
export const pool =
  globalState.__aiChatPool ??
  new pg.Pool({ connectionString: env().DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalState.__aiChatPool = pool;

export const db = drizzle(pool, { schema });
