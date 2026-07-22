# Fresh Install Smoke Test

Use this checklist to verify that a fresh Reservas CRM checkout can boot with
public-safe placeholder configuration.

Do not use production credentials for this smoke test.

## Prerequisites

- Git.
- Docker with Docker Compose.
- `curl`.
- A clean temporary directory.

## Commands

```bash
git clone https://github.com/jespinolas/reservas-crm.git reservas-crm-smoke
cd reservas-crm-smoke
cp .env.example .env
```

Edit `.env` and replace every `REEMPLAZA_...` value with local-only placeholder
values. Generate placeholders with:

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -hex 32      # META_WEBHOOK_VERIFY_TOKEN
```

For local smoke testing, use:

```text
APP_BASE_URL=http://localhost:3000
DOMAIN=localhost
```

Then boot the app and database:

```bash
docker compose up --build -d
```

Migrations run automatically when the app container starts. Watch startup logs:

```bash
docker compose logs -f app
```

The expected migration evidence is:

```text
[migrate] migraciones aplicadas
```

Verify the app health endpoint through Caddy:

```bash
curl -fk https://localhost/api/health
```

Expected result: `curl` exits with status `0`.

## Cleanup

```bash
docker compose down -v
cd ..
rm -rf reservas-crm-smoke
```

## Expected Optional-Integration Behavior

Without WhatsApp, Meta, Google, or AI provider credentials:

- The app should still boot.
- `/api/health` should respond.
- AI agent and lab features may remain unavailable until configured.
- Real WhatsApp sends and templates must not be attempted.

## Failure Evidence

If the smoke test fails, record:

- Commit SHA.
- Host operating system.
- Docker version.
- Command that failed.
- Redacted container logs.
- Whether any optional credential was intentionally omitted.

Do not include secrets, raw tokens, private phone numbers, private domains, or
customer data in evidence.
