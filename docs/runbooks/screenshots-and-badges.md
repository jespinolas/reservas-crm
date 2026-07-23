# Screenshots And README Badges

Use this checklist before updating public screenshots or README badges.

## Screenshot Requirements

Public screenshots must:

- Be captured from Reservas CRM, not copied from upstream project assets.
- Use synthetic or demo data only.
- Avoid secrets, tokens, webhook URLs, authorization headers, customer phone
  numbers, production domains, customer names, private messages, and private
  installation identifiers.
- Show current branding and current UI.
- Be stored under `docs/screenshots/`.

Current README screenshots:

| File | Purpose |
| --- | --- |
| `docs/screenshots/reservas-inbox.png` | Inbox overview. |
| `docs/screenshots/reservas-reservations.png` | Reservations view. |
| `docs/screenshots/reservas-settings-about.png` | About/settings with project identity and upstream credit. |

Current screenshot evidence is tracked in
[`docs/screenshots/README.md`](../screenshots/README.md).

## Refresh Triggers

Refresh screenshots when:

- The first viewport or main navigation changes.
- Branding, color, or product naming changes.
- The README references a workflow that changed visually.
- User-visible UI changes are included in a release.
- A screenshot is found to contain private or stale data.

## Review Checklist

Before committing screenshots:

- Confirm the screenshot is from the maintained Reservas CRM app.
- Confirm no private or production data appears.
- Confirm the image renders correctly in GitHub.
- Confirm dimensions and file size are reasonable.
- Confirm README links still resolve.

## Badge Eligibility

Do not add badges until the linked public resource exists and is visible without
private authentication.

Allowed badges after resources exist:

- CI workflow status for `.github/workflows/ci.yml`.
- Latest GitHub release.
- License.
- GHCR package when images are published.
- Security policy when `SECURITY.md` exists and GitHub security-policy routing
  points users away from public vulnerability reports.
- Project status when linked to a public roadmap that accurately states current
  project maturity.

Do not add:

- Badges for local-only workflows.
- Release badges before a release exists.
- GHCR badges before image publication exists.
- Badges that imply support, security, or deployment guarantees that the project
  does not provide.

## Planned Badge Targets

When eligible, use public links for:

- `https://github.com/jespinolas/reservas-crm/actions/workflows/ci.yml`
- `https://github.com/jespinolas/reservas-crm/releases`
- `https://github.com/jespinolas/reservas-crm/blob/main/LICENSE`
- `https://github.com/jespinolas/reservas-crm/security/policy`
- `https://github.com/jespinolas/reservas-crm/blob/main/ROADMAP.md`
- `https://github.com/jespinolas/reservas-crm/pkgs/container/reservas-crm`

## Current README Badge Review

Reviewed on 2026-07-23:

| Badge | README target | Eligibility evidence |
| --- | --- | --- |
| CI | `actions/workflows/ci.yml` | `.github/workflows/ci.yml` exists and GitHub reports the workflow as active. |
| Release | `releases` | GitHub releases exist; `v1.0.0` is the current stable release baseline. |
| GHCR | `pkgs/container/reservas-crm` | Package page returns HTTP 200 publicly; GHCR image publishing workflow exists. |
| License | `LICENSE` | MIT license file exists in the repository. |
| Security Policy | `SECURITY.md` | Public security policy exists and GitHub issue templates route vulnerability reports away from public issues. |
| Status | `ROADMAP.md` | Public roadmap exists and the badge text matches current alpha-ready project posture. |

## Evidence

Record screenshot review notes and badge target inspection in release evidence
when screenshots or badges change.
