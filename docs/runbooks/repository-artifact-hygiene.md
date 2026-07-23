# Repository Artifact Hygiene

Run this checklist before opening public repository pull requests, publishing
tags, creating releases, or publishing container images.

## Public Scope

Keep files that are intentionally useful to users, contributors, builds, tests,
legal attribution, security reporting, deployment, or release review.

Examples:

- Product source code and tests.
- Build, lint, typecheck, and Docker configuration.
- `README.md`, `LICENSE`, `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`, and
  `CODE_OF_CONDUCT.md`.
- Public deployment, security, release, and maintenance docs.
- Synthetic screenshots reviewed for public use.

## Private Scope

Do not publish local assistant tooling, AI interaction records, private planning
notes, local MCP configuration, prompt logs, chat transcripts, completion
reports, generated tool dumps, local environment files, secrets, keys, cookies,
database dumps, or production identifiers.

If a file is unclear, treat it as private until reviewed.

Security reports, vulnerability reproductions, exploit notes, leaked-secret
triage, customer logs, and private reporter contact details are private scope
unless the maintainer explicitly prepares a public-safe advisory.

## Required Checks

1. Inspect tracked, untracked, and ignored files:

   ```bash
   git status --short --ignored
   ```

2. Search for private workflow artifacts:

   ```bash
   rg -n "Claude|Codex|assistant|prompt log|chat log|completion report|MCP|Spec Kit|speckit|subagent|\\.claude|\\.specify|\\.mcp" .
   ```

3. Search for secret-shaped content:

   ```bash
   rg -n "token|secret|password|private key|authorization|cookie|BEGIN .*PRIVATE KEY" .
   ```

4. Review findings manually. Product code and tests may legitimately contain
   terms such as `token`, `secret`, `password`, `assistant`, or `prompt`; only
   usable credentials, private notes, and local assistant artifacts are blocked.

5. Confirm required public files still exist:

   ```bash
   test -f README.md
   test -f LICENSE
   test -f NOTICE
   test -f SECURITY.md
   test -f CONTRIBUTING.md
   ```

## If A Secret Is Found

Stop publication. Do not copy the secret into issues, pull requests, release
notes, or evidence. Ask the repository owner whether rotation is required.

## Completion Evidence

Record only high-level results:

- Commands run.
- Whether private artifacts were removed or ignored.
- Whether potential secrets were found.
- Any known limitations.

Do not include private artifact contents in completion evidence.
