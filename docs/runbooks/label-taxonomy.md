# GitHub Label Taxonomy

Use these labels for public issues and pull requests. Do not apply labels that
include customer names, private installation identifiers, private phone numbers,
or internal business strategy.

Do not mutate GitHub labels without maintainer approval.

## Type Labels

| Label | Use |
| --- | --- |
| `bug` | Reproducible defect or regression. |
| `feature` | New user-facing or maintainer-facing capability. |
| `security` | Security-sensitive work or public-safe security tracking. Do not include exploit details in public issues. |
| `docs` | Documentation-only change. |
| `dependencies` | Dependency, lockfile, package-manager, or vulnerability-update work. |

## Area Labels

| Label | Use |
| --- | --- |
| `reservations` | Reservation workflows, resources, availability, holds, confirmations, cancellations, reminders, or reporting. |
| `whatsapp` | WhatsApp Cloud API, webhooks, templates, inbox delivery, connection state, or message sending. |
| `ai` | AI agent configuration, knowledge base, lab, model adapter, or AI tool boundaries. |
| `deployment` | Docker, Coolify, environment variables, backups, restores, health checks, or upgrades. |

## Contributor Label

| Label | Use |
| --- | --- |
| `good first issue` | Scoped, low-risk issue with enough context for a new contributor. |

## Triage State Labels

| Label | Use |
| --- | --- |
| `needs triage` | New issue or pull request that has not been reviewed by a maintainer. |
| `needs info` | Waiting for reproduction details, logs with secrets redacted, screenshots with synthetic data, or environment information. |
| `accepted` | Maintainer agrees the issue should be worked on. |
| `blocked` | Cannot proceed until an external decision, dependency, access, or prerequisite is resolved. |
| `wontfix` | Maintainer has decided not to pursue the request. Explain the reason respectfully. |

## Suggested Colors

Colors are advisory. Label names and descriptions are more important than exact
colors.

| Label | Color |
| --- | --- |
| `bug` | `d73a4a` |
| `feature` | `0e8a16` |
| `security` | `b60205` |
| `docs` | `0075ca` |
| `dependencies` | `0366d6` |
| `reservations` | `fbca04` |
| `whatsapp` | `25d366` |
| `ai` | `7057ff` |
| `deployment` | `5319e7` |
| `good first issue` | `7057ff` |
| `needs triage` | `ededed` |
| `needs info` | `d876e3` |
| `accepted` | `0e8a16` |
| `blocked` | `b60205` |
| `wontfix` | `ffffff` |

## Verification

After labels are applied in GitHub, inspect:

```bash
gh label list --repo jespinolas/reservas-crm
```

Record any missing labels, conflicting descriptions, or permission blockers in
maintenance evidence.
