# Release Process

Reservas CRM uses SemVer with a leading `v` tag prefix.

Do not publish a GitHub release, tag, production deployment, GHCR image,
customer deployment, production migration, credential change, DNS change,
billing change, or real WhatsApp send without explicit maintainer approval.

## Version Rules

| Version | Meaning |
| --- | --- |
| `vMAJOR.MINOR.PATCH-alpha.N` | Early prerelease. May contain incomplete or changing work. |
| `vMAJOR.MINOR.PATCH-beta.N` | Feature-complete prerelease for broader validation. |
| `vMAJOR.MINOR.PATCH-rc.N` | Release candidate. Only stabilization fixes should enter without explicit approval. |
| `vMAJOR.MINOR.PATCH` | Stable release. Requires explicit owner approval. |

Examples:

- `v1.1.0-alpha.1`
- `v1.1.0-beta.1`
- `v1.1.0-rc.1`
- `v1.1.0`

The first planned implementation prerelease after the public foundation work is
`v1.1.0-alpha.1`.

## Immutable Tags

Published tags are immutable. Do not move or rewrite a published tag. If a tag
points at the wrong commit, publish a corrective version and document the
mistake in release evidence.

## Release Branches

Use release branches only when a version needs stabilization separate from
ongoing feature work.

Branch format:

```text
release/vMAJOR.MINOR
```

Examples:

- `release/v1.1`
- `release/v2.0`

Feature and fix work should still enter through pull requests.

## Required Evidence

Before publishing a prerelease or stable release, collect:

- Version and commit SHA.
- Tag name and expected tag target.
- CI status for `Test`, `Typecheck`, `Lint`, and `Build`.
- Local verification commands and results.
- Fresh install smoke-test result when install or deployment behavior is in
  scope.
- Docker build or image publishing result when image artifacts are in scope.
- Changelog entries.
- Upgrade notes.
- Known limitations.
- Security notes.
- Screenshot evidence when user-visible UI changed.
- Owner approval and reviewer approval when available.

Use [`release-evidence.md`](release-evidence.md) for the required evidence
format.

Release evidence must be committed or corrected before release notes claim the
release is complete. A prerelease may document pending or failed verification as
a known limitation; a stable release may not do so without explicit owner
approval.

## Release Notes

GitHub release notes must be derived from committed sources:

- `CHANGELOG.md`
- Pull requests included in the release.
- Release evidence artifacts.
- Security notes that are safe to publish.

Use these sections when applicable:

- Highlights
- Added
- Changed
- Fixed
- Security
- Upgrade Notes
- Known Limitations
- Verification

## Failed Or Withdrawn Prereleases

Do not delete or move published prerelease tags as a normal fix. Publish a new
prerelease with a higher prerelease number and document the failure or
withdrawal in release evidence.

If a prerelease is incomplete, state that in GitHub release notes and link to
the evidence file. Do not promote an incomplete prerelease to stable without new
verification evidence.

## Approval Boundary

Stable releases require explicit owner approval. Prereleases also require
approval when they publish tags, GitHub releases, GHCR images, production
deployment artifacts, or user-facing release notes.

Approval must be recorded in release evidence. Human approval is also required
before production deployments, production migrations, DNS changes, credential
changes, billing changes, customer deployments, or real WhatsApp sends.
