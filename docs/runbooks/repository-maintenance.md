# Repository Maintenance

Use this checklist to keep Reservas CRM maintainable as a public open-source
project. Maintenance work should happen through branches and pull requests.

## Weekly

- Review new issues and pull requests.
- Apply type, area, contributor, and triage labels from
  [`label-taxonomy.md`](label-taxonomy.md).
- Ask for missing reproduction details with `needs info` instead of guessing.
- Review Dependabot or dependency-update pull requests.
- Run the local verification gate when dependency or workflow changes are
  accepted:

  ```bash
  pnpm test
  pnpm typecheck
  pnpm lint
  pnpm build
  ```

## Monthly

- Review stale issues and pull requests.
- Close stale items only when they are inactive, low-signal, or no longer match
  project direction. Reopen if new actionable information arrives.
- Review public repository metadata:
  - Repository description.
  - Topics.
  - Homepage link.
  - README accuracy.
  - License and notice files.
  - Security policy.
  - Current screenshots with synthetic data.
- Run the repository artifact hygiene checklist before any public release work.

## Security Review

At least monthly, and before every release or prerelease:

- Review `SECURITY.md` for current reporting instructions.
- Check that `.env.example` uses placeholders only.
- Confirm public docs do not include production credentials, private customer
  data, internal domains, raw tokens, or exploit details.
- Review webhook, token encryption, logging, and secret-handling docs when those
  areas change.
- Record only public-safe findings in maintenance evidence.

## Release Readiness

Before a prerelease or stable release:

- Confirm `main` has passing required checks.
- Confirm changelog entries are current.
- Confirm release evidence exists or is ready to be created.
- Confirm upgrade notes, known limitations, and security notes are clear.
- Confirm screenshots are current when user-visible UI changed.
- Confirm no production deployment, DNS change, credential change, production
  migration, billing change, GitHub release, tag, GHCR publish, customer
  deployment, or real WhatsApp send happens without explicit approval.

## Public-Safe Maintenance Evidence

Record:

- Date and maintainer.
- Commands run and results.
- Issues or pull requests reviewed.
- Dependency findings.
- Security review status.
- Public metadata status.
- Follow-up issues or specs created.

Do not record secrets, private customer information, private AI interactions, or
exploit details.
