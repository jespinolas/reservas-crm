# Public Screenshot Evidence

This directory stores public screenshots used by the Reservas CRM README and
release evidence.

Screenshots must come from the maintained Reservas CRM application, use
synthetic data, and avoid secrets, webhook URLs, authorization headers,
customer phone numbers, production domains, customer names, private messages,
and private installation identifiers.

## Current Screenshot Set

Reviewed on 2026-07-23 against public `main` after the repository foundation,
deployment documentation, security documentation, and Next.js patch update
landed.

| File | Size | Purpose | Public-safety review |
| --- | --- | --- | --- |
| `reservas-inbox.png` | 1440x960 | README hero screenshot showing the inbox and current Reservas CRM branding. | Synthetic contact names and messages; no phone numbers, tokens, domains, or webhook URLs visible. |
| `reservas-reservations.png` | 1440x960 | README secondary screenshot showing the reservations view. | Empty synthetic reservation state; no customer data, identifiers, or secrets visible. |
| `reservas-settings-about.png` | 1440x960 | README secondary screenshot showing product identity, project ownership, license posture, and upstream attribution. | Public repository URL and public upstream credit only; no private infrastructure or credentials visible. |

## Refresh Process

1. Run a local or staging Reservas CRM instance with synthetic data.
2. Capture the required views at a desktop viewport close to 1440x960.
3. Review every image for private data, secrets, internal URLs, real customer
   information, and stale branding.
4. Keep image file sizes reasonable for GitHub rendering.
5. Update this manifest when screenshots are added, replaced, or removed.

## Refresh Triggers

Refresh these files when:

- The README first viewport changes.
- Navigation, branding, or product identity changes.
- Inbox, reservations, or settings/about UI changes materially.
- A release includes user-visible UI changes.
- A screenshot is found to contain private data or stale identity.
