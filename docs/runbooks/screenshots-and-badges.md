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
- `https://github.com/jespinolas/reservas-crm/pkgs/container/reservas-crm`

## Evidence

Record screenshot review notes and badge target inspection in release evidence
when screenshots or badges change.
