# Security Policy

## Supported Versions

Security fixes target the current `main` branch until versioned releases are
introduced.

## Reporting A Vulnerability

Please do not open public GitHub issues for vulnerabilities, leaked secrets, or
exploit details.

Use GitHub's security policy entry for this repository when available:
`https://github.com/jespinolas/reservas-crm/security/policy`.

Until a dedicated security mailbox or private advisory process is published,
contact the maintainer privately and include:

- A concise description of the issue.
- Affected routes, files, or deployment settings.
- Reproduction steps using placeholders instead of real credentials.
- Impact and suggested mitigation, if known.

Do not include live access tokens, database passwords, private keys, real
customer phone numbers, private message bodies, database dumps, or production
webhook URLs in the report unless the maintainer explicitly asks for a secure
transfer path.

For public follow-up, use high-level language only. Keep exploit details,
private logs, and vulnerable customer identifiers out of public issues, pull
requests, changelogs, release evidence, and screenshots.

## Security Baseline

- Customer deployments must remain isolated by database, secrets, domain,
  persistent storage, and backup namespace.
- WhatsApp tokens and integration credentials must never be logged or committed.
- Reservation availability, holds, pricing, confirmation, cancellation, reminder,
  payment, and sync decisions must remain deterministic application/database
  logic.
- n8n and other automations may consume events but must not write directly to
  CRM reservation tables or become reservation authority.
- AI prompts and model instructions must not receive credentials or make
  authoritative reservation decisions.

One business installation should have its own:

- PostgreSQL database and credentials.
- `BETTER_AUTH_SECRET`.
- `ENCRYPTION_KEY`.
- `META_WEBHOOK_VERIFY_TOKEN`.
- `META_APP_SECRET` when direct Meta webhook signature validation is used.
- WhatsApp WABA credentials.
- Persistent volumes.
- Backup and restore namespace.
- Public domain and HTTPS certificate.

Do not use one database, one `.env`, one backup bucket/prefix, or one webhook
token across multiple businesses.

## Secret Handling

Never commit usable secrets, tokens, passwords, encryption keys, authorization
headers, cookies, private keys, production identifiers, database dumps, or
customer data.

Use `.env.example` for placeholders only. Generate unique values per
installation for:

- `POSTGRES_PASSWORD`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET` when used
- Any AI provider token
- Any provisioning or automation signing secret

Store production values in your deployment platform or secret manager, not in
Git. Do not reuse secrets across customer installations.

Public-safe examples should use placeholders:

```text
APP_BASE_URL=https://crm.example.com
DATABASE_URL=postgresql://postgres:REDACTED@postgres:5432/reservas_crm
META_WEBHOOK_VERIFY_TOKEN=REDACTED_VERIFY_TOKEN
OPENROUTER_API_TOKEN=REDACTED_AI_TOKEN
```

Never paste real `.env` files into issues, pull requests, support chats,
screenshots, release notes, or release evidence.

If a secret was committed or posted publicly:

1. Stop sharing the material and remove the public copy when possible.
2. Assume the secret is compromised.
3. Rotate or revoke the secret with the provider.
4. Update the affected installation.
5. Review logs, screenshots, and release artifacts for secondary exposure.
6. Document the correction without republishing the secret.

## WhatsApp Webhook Posture

Production WhatsApp webhooks require HTTPS.

The webhook path includes `META_WEBHOOK_VERIFY_TOKEN`:

```text
https://crm.example.com/api/webhooks/wa/<META_WEBHOOK_VERIFY_TOKEN>
```

Treat the full webhook URL as sensitive. If `META_APP_SECRET` is configured,
the CRM validates Meta webhook signatures with `x-hub-signature-256`.

Do not publish real webhook URLs, WABA IDs, Phone Number IDs, access tokens, or
customer phone numbers in issues, screenshots, logs, pull requests, or release
evidence.

The webhook posture is layered:

- The route path includes `META_WEBHOOK_VERIFY_TOKEN`; wrong path tokens are
  rejected.
- Meta verification must use the configured verify token.
- `META_APP_SECRET` enables signature validation for incoming events.
- HTTPS is required for production Meta webhooks.

For direct Meta mode, configure `META_APP_SECRET` in production. If it is not
configured, the webhook is still protected by the secret URL path, but Meta
signature validation is not active.

For agency/platform mode, keep the platform token-exchange and provisioning
flow private. Public docs and screenshots should show only placeholders.

## Token Storage And Encryption

WhatsApp credentials are stored encrypted at rest by the CRM using the
installation `ENCRYPTION_KEY`. Google OAuth tokens and other integration
credentials that are persisted by the CRM should follow the same encryption and
redaction posture.

The UI must show only redacted token information, such as the last four
characters when needed for operator recognition. The full token must not be
logged, rendered after save, stored in screenshots, or copied into release
evidence.

If a token may have leaked:

1. Stop public sharing of the leaked material.
2. Rotate or revoke the token with the provider.
3. Update the CRM installation with the new token.
4. Review logs and screenshots for additional exposure.

If `ENCRYPTION_KEY` may have leaked, treat encrypted stored credentials as
exposed until the affected integration credentials are rotated. Changing
`ENCRYPTION_KEY` for an existing installation can make already encrypted values
unreadable unless a migration or re-encryption procedure is provided for that
release.

## Logging And Redaction

Logs and public evidence must not include:

- Full Meta or WhatsApp access tokens.
- Google refresh tokens.
- Database passwords.
- Encryption keys.
- Complete authorization headers.
- Cookies.
- Raw payment credentials.
- Real customer phone numbers or message bodies unless the customer has
  explicitly approved disclosure.

Use placeholders such as `REDACTED_TOKEN`, `crm.example.com`, and
`+15550000000` in public examples.

Before sharing logs publicly:

1. Remove authorization headers and cookies.
2. Remove webhook path tokens and full callback URLs.
3. Replace customer names, phone numbers, and message text with synthetic
   values.
4. Replace private domains, database hosts, and infrastructure identifiers with
   examples such as `crm.example.com`.
5. Keep only the minimum lines needed to explain the failure.

Backups may contain contacts, messages, reservations, encrypted credentials,
and other customer data. Store them outside the public repository, restrict
access, and avoid including backup filenames that identify customers in public
evidence.

## Provisioning And Automation

Protected provisioning endpoints require signing secrets and must not be exposed
as public unauthenticated integration points. Provisioning token material should
be delivered through secure runtime secret references where possible.

`CRM_PROVISIONING_ACCEPT_RAW_TOKEN_SMOKE_ONLY` is for smoke or test use only.
Do not enable it in production.

n8n and other automations may consume events, but they must not write directly
to CRM reservation tables or become reservation authority.

## AI Boundary

AI provider tokens are secrets. Do not place provider tokens, database
credentials, WhatsApp credentials, customer private data, or installation
secrets in prompts, model instructions, screenshots, or public lab evidence.

The AI agent may interpret intent and call typed tools. It must not become the
authority for availability, pricing, holds, confirmations, cancellations,
payments, reminders, or synchronization state.

## Dependency And Supply-Chain Security

Dependency updates should be reviewed through pull requests with CI evidence.
Security-critical updates should stay focused and should not be mixed with
unrelated refactors.

When a dependency advisory affects runtime security:

1. Prefer a targeted dependency PR.
2. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
3. Run the fresh-install smoke test when deployment/runtime behavior may be
   affected.
4. Document security notes in release evidence.
5. Avoid publishing exploit details in public discussion.

## Security-Sensitive Changes

Treat these areas as security-sensitive:

- Authentication and authorization.
- WhatsApp webhook verification and signature validation.
- Token encryption and redaction.
- Internal provisioning endpoints.
- Database credentials and backup storage.
- AI tool boundaries and prompt-injection handling.
- Deployment, restore, and upgrade documentation.
- Dependency updates that address vulnerabilities.

Security-sensitive pull requests need clear verification notes and should not
be merged if secret handling, webhook validation, or authorization behavior is
unclear.

## Deployment Checklist

Before production use:

- Replace every placeholder in `.env.example`.
- Use HTTPS for the public app URL.
- Use one database and secret set per business installation.
- Store backups outside the public repository.
- Verify `/api/health`.
- Confirm WhatsApp webhook verification works with placeholders redacted from
  evidence.
- Review [`docs/runbooks/repository-artifact-hygiene.md`](docs/runbooks/repository-artifact-hygiene.md)
  before publishing release artifacts.
- Review [`docs/deployment/environment.md`](docs/deployment/environment.md)
  before configuring production variables.
- Review [`docs/deployment/upgrades.md`](docs/deployment/upgrades.md) before
  production upgrades or rollbacks.

## Public Release Evidence

Release evidence and screenshots must be public-safe:

- Use synthetic domains and phone numbers.
- State whether `META_APP_SECRET` signature validation is configured without
  revealing the value.
- State whether token/encryption posture changed.
- Include dependency/security notes when applicable.
- Do not include real webhook URLs, WABA IDs, Phone Number IDs, access tokens,
  cookies, authorization headers, customer records, database dumps, or private
  installation identifiers.
