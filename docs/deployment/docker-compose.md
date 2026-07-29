# Docker Compose Deployment

This guide covers a self-hosted Reservas CRM deployment using Docker Compose.

Use one deployment per business. Do not share databases, secrets, persistent
volumes, backup namespaces, or domains between customer installations.

## 1. Prepare Environment

Copy the example file:

```bash
cp .env.example .env
```

Set production values:

- `APP_BASE_URL`: public HTTPS URL, such as `https://crm.example.com`.
- `DOMAIN`: domain used by Caddy when using the included Compose setup.
- `POSTGRES_PASSWORD`: unique generated PostgreSQL password.
- `DATABASE_URL`: PostgreSQL URL using the generated password.
- `BETTER_AUTH_SECRET`: unique session secret.
- `ENCRYPTION_KEY`: unique 32-byte base64 key.
- `META_WEBHOOK_VERIFY_TOKEN`: unique webhook path token.
- `META_APP_SECRET`: optional but recommended for Meta webhook signature
  validation in direct mode.
- `META_GRAPH_API_VERSION`: keep the default unless a release note says
  otherwise.
- `OPENROUTER_API_TOKEN`: optional AI provider token.

Generate secrets with:

```bash
openssl rand -hex 24
openssl rand -base64 32
openssl rand -hex 32
```

Do not commit `.env`.

## 2. Configure HTTPS And Webhooks

Production WhatsApp webhooks require HTTPS.

The WhatsApp webhook URL is:

```text
https://crm.example.com/api/webhooks/wa/<META_WEBHOOK_VERIFY_TOKEN>
```

Treat the full webhook URL as sensitive because the verify token is part of the
path.

## 3. Start

```bash
docker compose up -d --build
```

The app container runs migrations during startup before starting the Next.js
server.

Check logs:

```bash
docker compose logs -f app
```

Verify health:

```bash
curl -f https://crm.example.com/api/health
```

## 4. Upgrade

Before upgrading:

1. Read `CHANGELOG.md` and release notes.
2. Read release evidence for migrations, known limitations, and security notes.
3. Take a PostgreSQL backup.
4. Confirm the rollback path.

Then pull and restart:

```bash
git pull --ff-only
docker compose up -d --build
docker compose logs -f app
curl -f https://crm.example.com/api/health
```

## 5. Rollback

If an upgrade fails:

1. Stop the app.
2. Restore the prior Git revision or image tag.
3. Restore the database backup if migrations or data changes require it.
4. Start the prior version.
5. Verify `/api/health`.

Database rollback depends on the release's migration notes.
