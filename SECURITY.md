# Security Policy

## Supported Versions

Security fixes target the current `main` branch until versioned releases are
introduced.

## Reporting A Vulnerability

Please do not open public GitHub issues for vulnerabilities, leaked secrets, or
exploit details.

Until a dedicated security mailbox is published, contact the maintainer privately
and include:

- A concise description of the issue.
- Affected routes, files, or deployment settings.
- Reproduction steps using placeholders instead of real credentials.
- Impact and suggested mitigation, if known.

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

## Token Storage And Encryption

WhatsApp credentials are expected to be stored encrypted at rest by the CRM.
The UI must show only redacted token information, such as the last four
characters when needed for operator recognition.

If a token may have leaked:

1. Stop public sharing of the leaked material.
2. Rotate or revoke the token with the provider.
3. Update the CRM installation with the new token.
4. Review logs and screenshots for additional exposure.

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

## Security-Sensitive Changes

Treat these areas as security-sensitive:

- Authentication and authorization.
- WhatsApp webhook verification and signature validation.
- Token encryption and redaction.
- Internal provisioning endpoints.
- Database credentials and backup storage.
- AI tool boundaries and prompt-injection handling.
- Deployment, restore, and upgrade documentation.

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
