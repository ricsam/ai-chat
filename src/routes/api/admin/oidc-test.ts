import { createFileRoute } from "@tanstack/react-router";
import { jsonError } from "@/server/http";
import { testOidc } from "./config";

export const Route = createFileRoute("/api/admin/oidc-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return Response.json(await testOidc(request));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
