# Contributing

Thanks for helping improve `reservas-crm`.

## Ground Rules

- Keep the CRM self-hosted and one-business-per-instance by default.
- Preserve upstream MIT attribution in `LICENSE` and `NOTICE`.
- Do not commit secrets, tokens, `.env` files, production IDs, screenshots with credentials, or real customer data.
- Do not weaken WhatsApp webhook validation, authentication, authorization, or token encryption.
- Do not move authoritative reservation decisions into prompts, n8n workflows, or external automations.
- Add migrations for schema changes and tests for behavior changes.

## Local Setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Fill `.env` with local placeholder values only. Use real production credentials
only in your deployment platform or secret manager.

## Pull Requests

Before opening a pull request:

- Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- Update documentation when installation, configuration, or public behavior changes.
- Include screenshots for visible UI changes when practical.
- Explain any skipped verification clearly.

## Security Issues

Do not open public issues for vulnerabilities, secrets, or exploit details.
Use the process in `SECURITY.md`.
