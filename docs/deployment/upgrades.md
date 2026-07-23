# Upgrades And Rollbacks

Use this guide when moving a self-hosted Reservas CRM installation to a new
commit, tag, release, or container image.

No production upgrade, production migration, customer deployment, DNS change,
or credential change should happen without the installation owner approving the
maintenance window and rollback plan.

## Before Upgrading

1. Read `CHANGELOG.md`.
2. Read the GitHub release notes and `docs/releases/` evidence for the target
   version.
3. Confirm whether the release includes migrations, environment changes, known
   limitations, or security notes.
4. Take a PostgreSQL backup.
5. Confirm the restore command has been tested in a non-production restore
   drill.
6. Record the current commit, tag, or image digest.
7. Confirm the operator can access application logs.

## Docker Compose Upgrade

When deploying from Git:

```bash
git fetch --tags origin
git checkout <release-tag-or-commit>
docker compose up -d --build
docker compose logs -f app
curl -f https://crm.example.com/api/health
```

When deploying from a prebuilt image, update the image tag or digest in your
deployment configuration, then run:

```bash
docker compose up -d
docker compose logs -f app
curl -f https://crm.example.com/api/health
```

Expected migration evidence in app logs:

```text
[migrate] migraciones aplicadas
```

## Coolify Upgrade

1. Select the target commit, branch, tag, or container image.
2. Confirm runtime environment variables are still present.
3. Deploy the new version.
4. Watch application logs until migrations complete.
5. Verify `/api/health`.
6. Open the app and confirm login plus the first operational screen.

## Post-Upgrade Checks

Run these checks after every upgrade:

```bash
curl -f https://crm.example.com/api/health
```

Then verify:

- Login works for an owner account.
- The inbox loads.
- Settings -> WhatsApp shows the expected connection state.
- Reservation screens load.
- No app logs print secrets, full tokens, customer phone numbers, or private
  message bodies.

Do not send real WhatsApp messages as upgrade evidence unless the installation
owner explicitly approved that test.

## Rollback

Rollback depends on whether the failed upgrade changed data.

If no migrations or data changes were involved:

```bash
git checkout <previous-release-tag-or-commit>
docker compose up -d --build
docker compose logs -f app
curl -f https://crm.example.com/api/health
```

If migrations or data changes were involved:

1. Stop the upgraded app.
2. Restore the PostgreSQL backup that was taken before the upgrade.
3. Restore the previous Git revision, image tag, or image digest.
4. Start the previous version.
5. Verify `/api/health`.
6. Record the failed release, restore source, restore result, and known
   limitations.

## Evidence To Record

Keep release or maintenance evidence public-safe:

- Source version and target version.
- Backup timestamp and restore-drill status.
- Migration log result.
- `/api/health` result.
- Known limitations.
- Rollback decision, if rollback happened.

Do not record database passwords, auth secrets, encryption keys, Meta tokens,
webhook verify tokens, real webhook URLs, customer phone numbers, or customer
message content.
