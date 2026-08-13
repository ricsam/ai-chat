import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/server/db";

await pool.query("select pg_advisory_lock(hashtext('ai-chat:migrate'))");
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations complete");
} finally {
  await pool.query("select pg_advisory_unlock(hashtext('ai-chat:migrate'))");
  await pool.end();
}
