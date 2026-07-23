# Release Evidence

Every public Reservas CRM release and prerelease needs public-safe release
evidence before publication.

Do not publish a GitHub release, tag, GHCR image, production deployment,
customer deployment, production migration, DNS change, credential change,
billing change, or real WhatsApp send without explicit maintainer approval.

## Evidence Location

Use:

```text
docs/releases/<version>.md
```

Examples:

- `docs/releases/v1.1.0-alpha.1.md`
- `docs/releases/v1.1.0.md`

## Required Template

```markdown
# Release Evidence: <version>

## Summary

- Version:
- Release type: alpha | beta | rc | stable
- Date:
- Commit:
- Tag:
- Maintainer:
- Reviewer:

## Verification

| Check | Command Or Source | Result | Notes |
| --- | --- | --- | --- |
| Test | `pnpm test` |  |  |
| Typecheck | `pnpm typecheck` |  |  |
| Lint | `pnpm lint` |  |  |
| Build | `pnpm build` |  |  |
| Docker build | `docker build -t reservas-crm:<version> .` |  |  |
| Fresh install smoke | `docs/runbooks/fresh-install-smoke-test.md` |  |  |
| Deployment docs review | `docs/deployment/docker-compose.md`, `docs/deployment/coolify.md`, `docs/deployment/environment.md`, `docs/deployment/upgrades.md` |  |  |
| Security docs review | `SECURITY.md` |  |  |
| Secret scan | Repository hygiene checklist |  |  |

## Screenshots

- Required: yes | no
- Reason:
- Files:

## Upgrade Notes

- Migrations:
- Environment variables:
- Manual steps:
- Rollback limitations:

## Known Limitations

- None, or list public-safe limitations.

## Security Notes

- Secret handling:
- Webhook posture:
- Token/encryption posture:
- Vulnerability disclosure notes:

## GHCR Evidence

- Required: yes | no
- Image tags:
- Digest:
- Workflow run:
- Did `latest` change: yes | no

## Changelog And Release Notes

- Changelog section:
- GitHub release URL:
- Pull requests included:

## Approval

- Owner approval:
- Reviewer approval:
- Exceptions approved:
```

## Verification Requirements

Stable releases require all required checks to pass unless the owner explicitly
approves a public documented exception.

Prereleases may document known limitations, but failed verification must be
visible in evidence and release notes.

## Screenshot Evidence

If user-visible UI changed, include current public-safe screenshots or explain
why screenshots are not applicable.

Screenshots must follow
[`screenshots-and-badges.md`](screenshots-and-badges.md).

## Upgrade Notes

State whether the release includes:

- Database migrations.
- Environment variable changes.
- Manual deployment steps.
- Backup or restore requirements.
- Rollback limitations.

Use `No database migration.` only when verified.

## Security Notes

Security notes must be public-safe. Do not include exploit instructions, raw
tokens, passwords, private logs, authorization headers, customer data, or
private installation identifiers.

## Links

Release notes should link to:

- `CHANGELOG.md`
- The release evidence file.
- GitHub release page after publication.
- GHCR package page when images are published.

## Corrections

Do not move published tags. If source artifacts are wrong, publish a corrective
version and document the correction.
