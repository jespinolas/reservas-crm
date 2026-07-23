# Reservas CRM

[![CI](https://github.com/jespinolas/reservas-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/jespinolas/reservas-crm/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jespinolas/reservas-crm?sort=semver)](https://github.com/jespinolas/reservas-crm/releases)
[![GHCR](https://img.shields.io/badge/container-GHCR-blue.svg)](https://github.com/jespinolas/reservas-crm/pkgs/container/reservas-crm)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Security Policy](https://img.shields.io/badge/security-policy-blue.svg)](SECURITY.md)
[![Status](https://img.shields.io/badge/status-alpha--ready-orange.svg)](ROADMAP.md)

Open-source CRM for businesses that run conversations and bookings through
WhatsApp.

Reservas CRM is a self-hosted application for teams that want their WhatsApp
inbox, customer pipeline, AI-assisted replies, reservation workflows, templates,
and operational data in their own deployment. It is maintained by Martin
Espinola as the open CRM layer of the reservas.AI ecosystem.

One instance is designed for one business: one app, one database, one WhatsApp
connection, one set of secrets, one operating boundary.

![Reservas CRM inbox](docs/screenshots/reservas-inbox.png)

<p align="center">
  <img src="docs/screenshots/reservas-reservations.png" width="49%" alt="Reservas CRM reservations" />
  <img src="docs/screenshots/reservas-settings-about.png" width="49%" alt="Reservas CRM about settings" />
</p>

## What It Does

- Real-time WhatsApp inbox with contacts, message status, unread counts, human
  handoff, templates, and 24-hour window handling.
- Customer pipeline for tracking conversations from first contact to customer,
  lost lead, or custom stages.
- AI agent configuration with business knowledge, escalation rules, OpenRouter-
  compatible model adapters, and a sandbox lab for testing behavior before it
  replies to real customers.
- Reservation domain for resources, services, availability, holds,
  confirmations, reminders, and operational views.
- Google Calendar and automation-outbox foundations for integrations without
  making external tools the source of truth.
- White-label branding per installation: name and accent color can be changed
  from Settings.
- Docker-first deployment with PostgreSQL, encrypted WhatsApp credentials, and
  no required runtime SaaS beyond Meta and an optional LLM provider.

## Who It Is For

- Agencies and implementers deploying one CRM per client.
- Small and medium businesses that sell, schedule, reserve, or support through
  WhatsApp.
- Developers who want a practical open-source base for WhatsApp operations
  without putting customer conversation data into a shared SaaS database.

## Architecture Principles

- The CRM PostgreSQL database is the authority for reservations, availability,
  holds, pricing decisions, reminders, payment state, and sync state.
- AI can interpret intent and call typed tools, but deterministic application
  code must make authoritative booking decisions.
- n8n and other automations may consume events, but they must not write directly
  to CRM reservation tables or become the reservation engine.
- A deployment should keep each business isolated through separate credentials,
  database, secrets, volumes, domain, and backup namespace.

## Quick Start

Requirements:

- Docker on a VPS or local machine.
- A domain with HTTPS for real WhatsApp webhooks.
- A WhatsApp Cloud API number for production messaging.
- Optional OpenRouter-compatible API key for the AI agent and lab.

```bash
git clone https://github.com/jespinolas/reservas-crm.git
cd reservas-crm
cp .env.example .env
docker compose up -d --build
```

Fill `.env` with generated secrets before production use. The example file
documents each required value and includes generation commands.

Fresh install smoke test:

```bash
corepack enable
pnpm smoke:fresh-install
```

Health check:

```bash
curl https://crm.yourdomain.com/api/health
```

Detailed setup and operations:

- [Fresh install smoke test](docs/runbooks/fresh-install-smoke-test.md)
- [Docker Compose deployment](docs/deployment/docker-compose.md)
- [Coolify deployment](docs/deployment/coolify.md)
- [Environment reference](docs/deployment/environment.md)
- [Security policy](SECURITY.md)
- [Backups and restores](docs/deployment/backups-and-restores.md)
- [Upgrades and rollbacks](docs/deployment/upgrades.md)

Local development:

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yml up -d
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/reservas_crm
pnpm db:migrate
pnpm dev
```

## First Run

1. Open the app and create the first account. The first signup creates the
   business organization and becomes the owner.
2. Load demo data if you want a populated inbox, pipeline, knowledge base, and
   lab scenario.
3. Configure WhatsApp from Settings -> WhatsApp.
4. Configure the business name and color from Settings -> Brand.
5. Review upstream credits and license details from Settings -> About.

## WhatsApp Connection

Reservas CRM consumes WhatsApp Cloud API credentials. It does not implement
Meta Embedded Signup inside the CRM.

Direct mode:

1. Create a Meta app with the WhatsApp product.
2. Generate a system-user token with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
3. In Reservas CRM, save the WABA ID, Phone Number ID, and token.
4. Configure the webhook URL and verify token shown by the CRM.
5. Set `META_APP_SECRET` in production so webhook signatures are validated.

Agency/platform mode:

- Your platform performs Embedded Signup and token exchange.
- The CRM receives only the resulting customer WABA credentials through a
  protected provisioning path or the manual settings wizard.
- The customer WABA webhook callback can point directly at that customer's CRM
  instance.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Security

Do not commit `.env`, tokens, production identifiers, customer data, or
screenshots containing credentials. Report vulnerabilities privately using
[`SECURITY.md`](SECURITY.md), not public issues.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Keep
the CRM self-hosted, preserve customer isolation, and keep reservation authority
inside deterministic application/database logic.

## License

MIT. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
