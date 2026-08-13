import { createFileRoute } from "@tanstack/react-router";
import { HttpError, jsonError } from "@/server/http";
import { testProvider } from "./providers";

export const Route = createFileRoute("/api/providers/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return Response.json(await testProvider(request));
        } catch (error) {
          return jsonError(
            error instanceof SyntaxError
              ? new HttpError(400, "Invalid provider response")
              : error,
          );
        }
      },
    },
  },
});
