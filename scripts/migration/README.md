# Reservas Core migration tool

`core-import.mjs` inventories the current CRM and can idempotently import the
first Core slice plus reservation catalog and future booking state: contacts,
conversations, messages, resources, services, schedules, holds, and
reservations. It never prints a
database URL or secret-bearing value. The default mode is a redacted manifest
and does not write to either database.

From `reservas-crm`:

```bash
SOURCE_DATABASE_URL='[REDACTED]' \
TARGET_DATABASE_URL='[REDACTED]' \
MIGRATION_MANIFEST_PATH=.tmp/core-manifest.json \
node scripts/migration/core-import.mjs
```

Apply is intentionally restricted to staging:

```bash
MIGRATION_ENV=staging ALLOW_MIGRATION_APPLY=YES \
SOURCE_DATABASE_URL='[REDACTED]' TARGET_DATABASE_URL='[REDACTED]' \
node scripts/migration/core-import.mjs --apply
```

Production import, credential migration, provider cutover, and any record
without a required contact mapping require separate approved runbooks. The
importer maps source text IDs to deterministic UUIDs, converts payment-rule
minor units into Core price snapshots, records redacted exclusions, and
re-running it is safe because inserts are idempotent.
