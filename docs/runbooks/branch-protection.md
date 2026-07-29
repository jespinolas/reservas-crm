# Branch Protection

Use this runbook when configuring the public `main` branch in GitHub.

Do not apply or change GitHub branch protection settings without maintainer
approval. Keep feature and fix work on pull request branches.

## Required `main` Settings

Enable branch protection for `main` with:

- Require a pull request before merging.
- Require at least one approving review before merging.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Block force pushes.
- Block deletions.

## Required Status Checks

The required CI checks are produced by `.github/workflows/ci.yml`:

| Check | Command |
| --- | --- |
| `Test` | `pnpm test` |
| `Typecheck` | `pnpm typecheck` |
| `Lint` | `pnpm lint` |
| `Build` | `pnpm build` |

Do not mark branch protection complete until GitHub shows these exact check
names on a pull request and each required check can pass without production
credentials.

## Public-Safe CI Boundary

The CI workflow must use repository source, lockfile dependencies, and
placeholder/test-safe configuration only. It must not require Meta, WhatsApp,
Google, database, billing, or production deployment credentials.

## Verification

Before enabling required checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

After enabling branch protection, inspect GitHub repository settings and verify:

- Direct pushes to `main` are blocked.
- Force pushes to `main` are disabled.
- Pull request review is required.
- `Test`, `Typecheck`, `Lint`, and `Build` are required checks.

Record the inspection result in release or maintenance evidence.
