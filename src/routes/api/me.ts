import { createFileRoute } from "@tanstack/react-router";
import { jsonError } from "@/server/http";
import { sessionFromRequest } from "@/server/auth";

export const Route = createFileRoute("/api/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return Response.json(await sessionFromRequest(request));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
