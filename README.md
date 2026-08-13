# AI Chat

A white-label, self-hosted AI conversation workspace. It combines a ChatGPT-style session interface with per-user OpenAI-compatible providers and trusted remote MCP tools.

## Features

- Serialized first-boot administrator setup with an optional installation claim token.
- Local recovery login plus administrator-configured OpenID Connect.
- User administration, disable/role safety, and temporary-password rotation.
- Per-user encrypted OpenAI-compatible API keys, custom endpoints, and model catalogs.
- Per-user Streamable HTTP/SSE MCP servers with encrypted headers and tool-definition drift detection.
- Streaming Vercel AI SDK chat with persistent sessions, reasoning, tool details, stop, retry, rename, and delete.
- shadcn/ui and vendored [AI Elements](https://elements.ai-sdk.dev/) components.
- Runtime white-label name, tagline, and accent configuration.
- Bun production runtime, PostgreSQL 17, Docker image, and Helm chart.

## Local development

Requirements: Bun 1.3+, Docker, and PostgreSQL 17.

```bash
docker compose up -d postgres
cp .env.example .env
# Change all example secret values in .env
bun install
bun run db:migrate
bun run dev
```

Visit `http://localhost:3000`. A fresh database opens the first-administrator flow. `SETUP_CLAIM_TOKEN`, when set, must be entered to claim an installation.

## Checks

```bash
bun run typecheck
bun test
bun run build
docker build -t ai-chat:local .
helm lint charts/ai-chat \
  --set secrets.values.authSecret=<secret> \
  --set secrets.values.encryptionKey=<secret> \
  --set secrets.values.setupClaimToken=<claim> \
  --set postgresql.password=<database-password>
```

## OIDC

From **Administration → Authentication**, configure the issuer, client ID/secret, allowed domains, verified-email account linking, and optional just-in-time provisioning. Register this exact callback:

```text
<BASE_URL>/api/auth/oauth2/callback/<provider-key>
```

Keep local administrator login available. Start with JIT disabled, pre-create a pilot user, test discovery, and then enable the provider.

## Provider and MCP security

Secrets are encrypted with AES-256-GCM using `SETTINGS_ENCRYPTION_KEY`. Back up this key with the database; rotating it without re-encrypting stored values makes those values unreadable.

Remote endpoints require HTTPS by default. Loopback, link-local, private, and metadata destinations are rejected unless the operator explicitly enables private egress. Redirects are rejected. MCP tools run automatically only after the user trusts the discovered definitions; changed or newly added tool definitions block use until re-trusted.

## Helm

The container image is published at `ghcr.io/ricsam/ai-chat`. The chart defaults to the matching immutable `0.1.0` image tag.

After the chart release workflow has published GitHub Pages:

```bash
helm repo add ai-chat https://ricsam.github.io/ai-chat
helm repo update
helm show values ai-chat/ai-chat
```

See [`charts/ai-chat/README.md`](charts/ai-chat/README.md). The chart supports an existing Secret, bundled or external PostgreSQL, a non-root read-only app container, migration init container, probes, NetworkPolicy, optional Traefik Ingress, and Ceph RBD persistence without `subPath`.

For an unclaimed public install, keep the Ingress disabled until an operator has a `SETUP_CLAIM_TOKEN` ready. Do not expose an unprotected first-boot setup page.
