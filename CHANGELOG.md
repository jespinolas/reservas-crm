# Changelog

All notable changes to Reservas CRM are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
style sections and uses SemVer version names. Release notes must be derived from
committed changelog entries, release evidence, and merged pull requests.

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Fixed

- Nothing yet.

### Security

- Updated dependency security posture by resolving vulnerable PostCSS, Sharp,
  and esbuild dependency paths through direct updates and pnpm overrides.

## [1.1.0-alpha.2] - 2026-07-23

### Added

- Reproducible fresh-install smoke test script covering clean clone setup,
  placeholder environment generation, Docker Compose boot, migrations, and the
  `/api/health` endpoint.
- Public deployment documentation for Docker Compose, Coolify, environment
  variables, HTTPS/webhooks, backups, restores, and upgrades.
- Public screenshot maintenance guidance and release evidence template for
  future branded release artifacts.

### Changed

- Release evidence process now requires verification results, screenshots when
  applicable, upgrade notes, known limitations, security notes, approval state,
  and exception handling for every release or prerelease.
- Public security documentation now gives clearer guidance for secret handling,
  WhatsApp webhook posture, token encryption, dependency security, and
  vulnerability reporting.
- Automated bot PR assignment now skips bot-authored pull requests, and
  Dependabot update noise is reduced through weekly grouped updates.
- Dependency maintenance updates for Next.js, Drizzle ORM, Vitest, direct
  PostCSS, and nested PostCSS versions.

### Fixed

- `v1.1.0-alpha.1` release evidence was reconciled with the published GHCR
  prerelease image digest and workflow run.

### Security

- Dependency maintenance includes a Next.js patch update and supporting
  dependency refreshes.
- Security and deployment examples remain public-safe and continue to require
  installation-specific secrets outside the repository.

## [1.1.0-alpha.1] - 2026-07-22

### Added

- Public repository foundation work for CI, branch protection, artifact hygiene,
  and maintenance documentation.

### Changed

- Reservas CRM public identity, contribution guidance, and maintenance workflow
  continue to diverge from the original upstream starter into a maintained
  Reservas CRM project.

### Fixed

- Nothing yet.

### Security

- Public repository hygiene excludes assistant tooling artifacts, local
  configuration, private planning notes, and secret-bearing file patterns from
  public scope.

## [1.0.0] - 2026-07-22

### Added

- Initial public Reservas CRM baseline.
- Self-hosted WhatsApp CRM foundation with inbox, contacts, pipeline,
  settings, AI-assisted workflows, and reservation-oriented direction.
- MIT licensing with upstream attribution preserved in legal notice files.

### Security

- Public security policy and secret-handling expectations for self-hosted
  deployments.

[Unreleased]: https://github.com/jespinolas/reservas-crm/compare/v1.1.0-alpha.2...HEAD
[1.1.0-alpha.2]: https://github.com/jespinolas/reservas-crm/compare/v1.1.0-alpha.1...v1.1.0-alpha.2
[1.1.0-alpha.1]: https://github.com/jespinolas/reservas-crm/compare/v1.0.0...v1.1.0-alpha.1
[1.0.0]: https://github.com/jespinolas/reservas-crm/releases/tag/v1.0.0
