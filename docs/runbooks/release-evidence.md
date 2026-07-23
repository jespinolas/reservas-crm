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

Start from:

```text
docs/releases/TEMPLATE.md
```

Only one evidence file may own a version. Concurrent release candidates must
use distinct versions, tags, and evidence files.

Prepare evidence before publishing tags, GitHub releases, or GHCR images when
practical. If a tag or image must be created to collect final evidence, update
the evidence file in a follow-up pull request before treating the release as
complete.

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
| Fresh install smoke | `pnpm smoke:fresh-install` |  |  |
| Deployment docs review | `docs/deployment/docker-compose.md`, `docs/deployment/coolify.md`, `docs/deployment/environment.md`, `docs/deployment/upgrades.md` |  |  |
| Security docs review | `SECURITY.md` |  |  |
| Screenshot and badge review | `docs/runbooks/screenshots-and-badges.md`, `docs/screenshots/README.md`, `README.md` |  |  |
| Secret scan | Repository hygiene checklist |  |  |
| GitHub CI | Pull request or `main` workflow run |  |  |

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

Evidence must record:

- Command or source used.
- Result: passed, failed, skipped, not applicable, or pending.
- Relevant workflow URL, image digest, commit, or local command context.
- Public-safe notes explaining skipped or failed checks.

For stable releases, failed or pending checks are release blockers unless the
owner explicitly approves a documented exception. For prereleases, known
failures may be allowed only when they are visible in evidence and GitHub
release notes.

## Screenshot Evidence

If user-visible UI changed, include current public-safe screenshots or explain
why screenshots are not applicable.

Screenshots must follow
[`screenshots-and-badges.md`](screenshots-and-badges.md).

Evidence must identify:

- Whether screenshots are required.
- Which files were reviewed.
- Whether the images use synthetic data.
- Whether any screenshot was refreshed for the release.
- Why screenshots are not applicable when omitted.

## Upgrade Notes

State whether the release includes:

- Database migrations.
- Environment variable changes.
- Manual deployment steps.
- Backup or restore requirements.
- Rollback limitations.

Use `No database migration.` only when verified.

If migrations are included, evidence must record migration command results,
backup expectations, restore expectations, and rollback limits. Do not imply a
production migration was run unless it was explicitly approved and actually
performed.

## Security Notes

Security notes must be public-safe. Do not include exploit instructions, raw
tokens, passwords, private logs, authorization headers, customer data, or
private installation identifiers.

Security notes must state whether the release changes:

- Secret handling.
- WhatsApp webhook posture.
- Token encryption or redaction.
- Authentication or authorization.
- Dependency or vulnerability posture.
- Public vulnerability disclosure instructions.

When nothing changed, say so directly.

## Known Limitations

Known limitations must be factual and public-safe. Include limitations that
affect installability, deployment, upgrade safety, screenshots, supported
runtime targets, incomplete prerelease behavior, or security posture.

Do not use known limitations to hide failed stable-release blockers. Stable
releases require explicit owner approval for any exception.

## Links

Release notes should link to:

- `CHANGELOG.md`
- The release evidence file.
- GitHub release page after publication.
- GHCR package page when images are published.

Release notes must be derived from committed sources:

- Changelog entries.
- Merged pull requests.
- Release evidence.
- Public-safe security notes.

Do not invent release claims that are not supported by committed docs, merged
code, workflow runs, release evidence, or approved maintainer notes.

## Approval And Exceptions

Evidence must record owner approval before publication. Reviewer approval should
be recorded when available.

Exceptions must identify:

- The failed or skipped requirement.
- The reason it is acceptable for this release type.
- Whether it is a prerelease limitation or a stable-release exception.
- The owner approval that accepted the risk.

Do not publish production deployments, customer deployments, production
migrations, DNS changes, credential changes, billing changes, real WhatsApp
sends, tags, GitHub releases, or GHCR images without explicit approval.

## Corrections

Do not move published tags. If source artifacts are wrong, publish a corrective
version and document the correction.

If evidence is incomplete but the released source artifacts are correct, update
the evidence through a follow-up pull request and note the correction in release
notes when material.

If a tag, release, or image points at the wrong source, do not silently rewrite
history. Publish a corrective version unless the owner explicitly approves
another path and there are no downstream consumers.
