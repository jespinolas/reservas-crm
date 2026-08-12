# Reservas CRM Mobile

Expo SDK 57 client for the shared Reservas Core API. The initial slice covers
secure session storage, login, organization-scoped contacts, and conversation
reads. Outbound manual replies will be added after the Core idempotency and
provider boundary is implemented.

## Local development

```bash
npm install
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to the API address reachable by the device. A phone
cannot use `localhost` to reach a server running on the development computer.

## Verification

```bash
npx tsc --noEmit
npm test
npx expo export --platform web
```

EAS build profiles are `development`, `staging`, and `production`. Their API
URLs and credentials belong in EAS environment configuration, never in this
repository.
