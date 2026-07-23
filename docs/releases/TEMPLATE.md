# Release Evidence: <version>

## Summary

- Version:
- Release type: alpha | beta | rc | stable
- Date:
- Commit:
- Tag:
- Maintainer:
- Reviewer:
- GitHub release URL:
- Changelog section:

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
- Review result:

## Upgrade Notes

- Migrations:
- Environment variables:
- Manual steps:
- Backup or restore requirements:
- Rollback limitations:

## Known Limitations

- None, or list public-safe limitations.

## Security Notes

- Secret handling:
- Webhook posture:
- Token/encryption posture:
- Dependency or vulnerability notes:
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
- Release notes source:
- Pull requests included:

## Exceptions

- Failed or skipped checks:
- Owner-approved exceptions:
- Prerelease limitations:
- Stable-release blockers:

## Approval

- Owner approval:
- Reviewer approval:
- Exceptions approved:
