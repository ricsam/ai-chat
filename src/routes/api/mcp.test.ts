import { createFileRoute } from "@tanstack/react-router";
import { HttpError, jsonError } from "@/server/http";
import { testMcp } from "./mcp";

export const Route = createFileRoute("/api/mcp/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return Response.json(await testMcp(request, false));
        } catch (error) {
          return jsonError(
            error instanceof SyntaxError
              ? new HttpError(400, "Invalid MCP response")
              : error,
          );
        }
      },
    },
  },
});
