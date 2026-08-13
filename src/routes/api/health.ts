import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.execute(sql`select 1`);
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
