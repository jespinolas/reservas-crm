# Backups And Restores

Reservas CRM stores operational data in PostgreSQL. Backups may contain contacts,
messages, reservations, credentials encrypted at rest, and other customer data.
Store backups securely.

## Backup

For Docker Compose deployments:

```bash
docker compose exec postgres pg_dump -U postgres reservas_crm > reservas_crm_backup.sql
```

Protect the backup file:

- Store it outside the public repository.
- Encrypt it when practical.
- Restrict access to trusted operators.
- Keep backup namespaces separate per installation.

## Restore

Stop the app before restore:

```bash
docker compose stop app
```

Restore into the PostgreSQL container:

```bash
cat reservas_crm_backup.sql | docker compose exec -T postgres psql -U postgres reservas_crm
```

Start and verify:

```bash
docker compose start app
docker compose logs -f app
curl -f https://crm.example.com/api/health
```

## Restore Drill

Before a production release, verify that a recent backup can be restored in a
non-production environment. Record:

- Backup date.
- Source version.
- Restore target version.
- Restore command result.
- `/api/health` result.
- Known limitations.

Do not record private customer data or secrets in restore evidence.
