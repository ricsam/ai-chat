# AI Chat Helm chart

Published releases are available from GitHub Pages:

```bash
helm repo add ai-chat https://ricsam.github.io/ai-chat
helm repo update
helm upgrade --install ai-chat ai-chat/ai-chat \
  --namespace ai-chat --create-namespace \
  --set secrets.existingSecret=ai-chat-secrets \
  --set postgresql.existingSecret=ai-chat-secrets
```

Install from a source checkout with an existing Secret whenever possible:

```bash
helm upgrade --install ai-chat ./charts/ai-chat \
  --namespace ai-chat --create-namespace \
  --set image.tag=<immutable-tag> \
  --set secrets.existingSecret=ai-chat-secrets \
  --set ingress.enabled=true \
  --set ingress.host=chat.example.com \
  --set config.baseUrl=https://chat.example.com
```

The Secret must contain `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, and (for a protected unclaimed install) `SETUP_CLAIM_TOKEN`. When bundled PostgreSQL uses the same Secret, include `POSTGRES_PASSWORD` and set `postgresql.existingSecret`. Alternatively, set `postgresql.password` during installation; do not commit it to a values file. Keep the encryption key with database backups; replacing it makes saved OIDC, provider, and MCP credentials unreadable.

The bundled PostgreSQL StatefulSet uses a whole `rook-ceph-block` PVC mounted at `/var/lib/postgresql/data`, without `subPath`. For production, an external managed PostgreSQL 17 service is recommended.
