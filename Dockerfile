FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run typecheck && bun run build

FROM oven/bun:1.3.14-alpine AS runtime
LABEL org.opencontainers.image.title="AI Chat" \
      org.opencontainers.image.description="White-label private AI chat workspace" \
      org.opencontainers.image.source="https://github.com/ricsam/ai-chat"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build --chown=bun:bun /app/.output ./.output
COPY --from=build --chown=bun:bun /app/drizzle ./drizzle
COPY --from=build --chown=bun:bun /app/scripts ./scripts
COPY --from=build --chown=bun:bun /app/src/server ./src/server
COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
USER bun
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
