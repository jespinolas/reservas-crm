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
