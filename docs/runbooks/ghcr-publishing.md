# GHCR Publishing

Reservas CRM Docker images are published to GitHub Container Registry from
approved version tags.

Do not publish images, tags, or releases without explicit maintainer approval.

## Image Name

```text
ghcr.io/jespinolas/reservas-crm
```

## Tag Rules

| Git tag | Image tags |
| --- | --- |
| `v1.1.0-alpha.1` | `ghcr.io/jespinolas/reservas-crm:v1.1.0-alpha.1` |
| `v1.1.0-beta.1` | `ghcr.io/jespinolas/reservas-crm:v1.1.0-beta.1` |
| `v1.1.0-rc.1` | `ghcr.io/jespinolas/reservas-crm:v1.1.0-rc.1` |
| `v1.1.0` | `ghcr.io/jespinolas/reservas-crm:v1.1.0` and `ghcr.io/jespinolas/reservas-crm:latest` |

`latest` is reserved for stable releases only. Alpha, beta, and rc tags must
never update `latest`.

## Workflow Permissions

The publishing workflow needs:

- `contents: read`
- `packages: write`

It must not require production Meta, WhatsApp, Google, database, billing, or
customer deployment credentials.

## Local Verification

Before publishing a tag that will publish an image:

```bash
docker build -t reservas-crm:local .
```

If a runtime smoke command is available for the release, run it and record the
result in release evidence.

## Failure Handling

If image publishing fails after a tag is created:

1. Do not move the tag.
2. Fix workflow permissions or source issues in a new commit.
3. Publish a corrective version if source changes are required.
4. Record the missing or corrected image artifact in release evidence.

## Evidence

Record:

- Git tag.
- Source commit.
- Published image tags.
- Image digest.
- Workflow run URL.
- Whether `latest` changed.
- Known limitations or failed artifact publication.
