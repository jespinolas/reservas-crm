# Coolify Deployment

This guide covers deploying Reservas CRM with Coolify from the public GitHub
repository.

Do not store production secrets in Git. Configure secrets in Coolify runtime
environment variables.

## 1. Create The Application

In Coolify:

1. Create a new application from the Reservas CRM repository.
2. Use the Dockerfile build pack.
3. Set the public domain for the application.
4. Enable HTTPS.
5. Add a PostgreSQL database resource or attach an existing dedicated database.

Use one database per business installation.

## 2. Environment Variables

Set the variables from `.env.example` in Coolify:

- `APP_BASE_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET` when used
- `META_GRAPH_API_VERSION`
- Optional AI provider variables

Generate unique values per installation. Do not reuse secrets across customer
installations.

## 3. Migrations

Reservas CRM runs migrations during container startup. Coolify pre-deploy hooks
are not required for migrations.

Watch application logs after deployment and verify:

```text
[migrate] migraciones aplicadas
```

## 4. WhatsApp Webhook

After HTTPS is active, configure Meta with:

```text
https://crm.example.com/api/webhooks/wa/<META_WEBHOOK_VERIFY_TOKEN>
```

Use the same verify token configured in Coolify.

## 5. Health Check

Verify:

```bash
curl -f https://crm.example.com/api/health
```

## 6. Upgrades

Before deploying a new version:

1. Read `CHANGELOG.md`.
2. Review release evidence.
3. Back up PostgreSQL.
4. Confirm whether migrations are included.
5. Deploy the new commit or image.
6. Check logs and `/api/health`.

## 7. Rollback

Use Coolify rollback to return to the previous deployment. If the release
included migrations or data changes, follow release-specific restore guidance
and restore PostgreSQL from backup when required.
