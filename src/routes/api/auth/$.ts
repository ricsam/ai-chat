import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeAuth } from "@/server/auth";

async function handle({ request }: { request: Request }) {
  return (await getRuntimeAuth()).handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
