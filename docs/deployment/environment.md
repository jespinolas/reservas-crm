# Environment Reference

Reservas CRM uses environment variables for deployment configuration and
secrets. Copy `.env.example` when deploying with Docker Compose, or enter the
same values as runtime environment variables in Coolify.

Do not commit `.env`, real tokens, customer domains, database dumps, or
screenshots that reveal configuration values.

## Required Variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `APP_BASE_URL` | Yes | `https://crm.example.com` | Public HTTPS URL for the CRM. WhatsApp webhook URLs are derived from this value. |
| `DATABASE_URL` | Yes | `postgresql://postgres:REDACTED@postgres:5432/reservas_crm` | PostgreSQL connection URL used by the app and migration runner. Use one database per business installation. |
| `BETTER_AUTH_SECRET` | Yes | `REDACTED_SESSION_SECRET` | Session signing secret. Generate a unique value per installation. |
| `ENCRYPTION_KEY` | Yes | `REDACTED_32_BYTE_BASE64_KEY` | 32-byte base64 key for encrypting WhatsApp credentials at rest. Generate with `openssl rand -base64 32`. |
| `META_WEBHOOK_VERIFY_TOKEN` | Yes | `REDACTED_VERIFY_TOKEN` | Secret webhook path segment and Meta verification token. Treat the full webhook URL as sensitive. |

## Docker Compose Variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `DOMAIN` | Yes for included Compose stack | `crm.example.com` | Caddy serves this domain and obtains HTTPS certificates. |
| `POSTGRES_PASSWORD` | Yes for included Compose stack | `REDACTED_POSTGRES_PASSWORD` | Password for the included PostgreSQL service. Must match `DATABASE_URL` when using the Compose database. |

For the included `docker-compose.yml`, the app container builds
`DATABASE_URL` from `POSTGRES_PASSWORD` and the internal `postgres` service.
Keep `DATABASE_URL` in `.env` aligned anyway so local commands and external
tools do not drift.

## WhatsApp Variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `META_APP_SECRET` | Recommended in production | `REDACTED_META_APP_SECRET` | Enables `x-hub-signature-256` validation for Meta webhook events. |
| `META_GRAPH_API_VERSION` | Optional | `v25.0` | Keep the default unless release notes say otherwise. |

WhatsApp WABA IDs, Phone Number IDs, and access tokens are configured inside
the application after boot or through a protected provisioning flow. Do not
publish those values in issues, logs, screenshots, or release evidence.

## AI Variables

AI is optional. Without AI provider credentials, the CRM still boots and core
CRM/reservation workflows remain available.

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `OPENROUTER_API_TOKEN` | No | `REDACTED_AI_TOKEN` | Optional token for OpenRouter-compatible model providers. |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api` | Optional provider base URL. |
| `OPENROUTER_MODEL` | No | `provider/model-name` | Main model for the agent. |
| `OPENROUTER_JUDGE_MODEL` | No | `provider/model-name` | Optional lab judge model. Falls back to the main model when omitted. |

## Operational Variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `ALLOW_SIGNUP` | No | `true` | Reopens public registration after the first organization. Leave unset for normal production operation. |
| `AGENT_COALESCE_MS` | No | `6000` | Delay used to group inbound messages before the agent turn. |

## Provisioning Variables

These variables are only for protected operator or platform flows. They are not
required for a basic self-hosted deployment.

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `CRM_PROVISIONING_SECRET` | No | `REDACTED_HMAC_SECRET` | HMAC secret for protected WhatsApp provisioning. Generate a unique value per installation. |
| `CRM_PROVISIONING_ACCEPT_RAW_TOKEN_SMOKE_ONLY` | No | `true` | Smoke-only raw token escape. Do not enable in production. |

## Secret Generation

Use unique values per installation:

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -hex 32      # META_WEBHOOK_VERIFY_TOKEN
openssl rand -base64 32   # CRM_PROVISIONING_SECRET, when used
```

## Public-Safe Examples

Use placeholders in public evidence:

```text
APP_BASE_URL=https://crm.example.com
DATABASE_URL=postgresql://postgres:REDACTED@postgres:5432/reservas_crm
META_WEBHOOK_VERIFY_TOKEN=REDACTED_VERIFY_TOKEN
```

Never publish real webhook URLs because the verify token is embedded in the
path:

```text
https://crm.example.com/api/webhooks/wa/<META_WEBHOOK_VERIFY_TOKEN>
```
