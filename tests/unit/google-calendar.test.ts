import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const insertedRows: Record<string, unknown>[] = [];
const updatedSets: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        insertedRows.push(value);
        return {
          onConflictDoUpdate: (input: { set: Record<string, unknown> }) => {
            updatedSets.push(input.set);
            return Promise.resolve();
          },
        };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        updatedSets.push(value);
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  }),
  schema: {
    googleCalendarConnection: { organizationId: "organization_id" },
    googleCalendarSync: {
      organizationId: "organization_id",
      reservationId: "reservation_id",
      attempts: "attempts",
    },
  },
}));

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  insertedRows.length = 0;
  updatedSets.length = 0;
});

describe("Google Calendar connection foundation", () => {
  it("encrypts OAuth tokens at rest and stores the events scope", async () => {
    const {
      GOOGLE_CALENDAR_EVENTS_SCOPE,
      saveGoogleCalendarConnection,
    } = await import("@/server/calendar/google");
    const accessToken = "google-access-token-secret";
    const refreshToken = "google-refresh-token-secret";

    await saveGoogleCalendarConnection({
      organizationId: "org_1",
      googleAccountEmail: "owner@example.com",
      calendarId: "primary",
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date("2026-07-18T13:00:00.000Z"),
    });

    const row = insertedRows[0]!;
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain(refreshToken);
    expect(row.scopes).toBe(GOOGLE_CALENDAR_EVENTS_SCOPE);
    expect(row.accessTokenCipher).toBeTruthy();
    expect(row.refreshTokenCipher).toBeTruthy();

    const { decryptSecret } = await import("@/lib/crypto");
    expect(
      decryptSecret({
        cipher: row.accessTokenCipher as string,
        iv: row.accessTokenIv as string,
        tag: row.accessTokenTag as string,
      })
    ).toBe(accessToken);
    expect(
      decryptSecret({
        cipher: row.refreshTokenCipher as string,
        iv: row.refreshTokenIv as string,
        tag: row.refreshTokenTag as string,
      })
    ).toBe(refreshToken);
  });

  it("re-saving a connection updates the existing organization row", async () => {
    const { saveGoogleCalendarConnection } = await import("@/server/calendar/google");

    await saveGoogleCalendarConnection({
      organizationId: "org_1",
      calendarId: "primary",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: new Date("2026-07-18T13:00:00.000Z"),
    });

    expect(updatedSets[0]).toMatchObject({
      calendarId: "primary",
      status: "connected",
    });
  });

  it("marks reconnect-required deterministically", async () => {
    const { markGoogleCalendarReconnectRequired } = await import("@/server/calendar/google");

    await markGoogleCalendarReconnectRequired("org_1");

    expect(updatedSets[0]).toMatchObject({
      status: "reconnect_required",
    });
  });

  it("records reservation sync state without mutating reservation rows", async () => {
    const { saveGoogleCalendarSyncState } = await import("@/server/calendar/google");

    await saveGoogleCalendarSyncState({
      organizationId: "org_1",
      reservationId: "rsv_1",
      googleEventId: "event_1",
      status: "synced",
      lastSyncedAt: new Date("2026-07-18T13:00:00.000Z"),
    });

    expect(insertedRows[0]).toMatchObject({
      organizationId: "org_1",
      reservationId: "rsv_1",
      googleEventId: "event_1",
      status: "synced",
    });
    expect(JSON.stringify(insertedRows)).not.toContain("confirmed");
    expect(JSON.stringify(updatedSets)).not.toContain("confirmed");
  });
});
