import { and, eq, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

export type GoogleCalendarConnection = {
  id: string;
  organizationId: string;
  googleAccountEmail: string | null;
  calendarId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  status: "connected" | "reconnect_required" | "disabled";
  createdAt: Date;
  updatedAt: Date;
};

export type GoogleCalendarSyncState = {
  id: string;
  organizationId: string;
  reservationId: string;
  googleEventId: string | null;
  status: "pending" | "synced" | "failed" | "deleted";
  attempts: number;
  lastError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function saveGoogleCalendarConnection(input: {
  organizationId: string;
  googleAccountEmail?: string | null;
  calendarId: string;
  scopes?: string[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}): Promise<void> {
  const db = getDb();
  const access = encryptSecret(input.accessToken);
  const refresh = encryptSecret(input.refreshToken);
  await db
    .insert(schema.googleCalendarConnection)
    .values({
      id: newId("googleCalendarConnection"),
      organizationId: input.organizationId,
      googleAccountEmail: input.googleAccountEmail ?? null,
      calendarId: input.calendarId,
      scopes: serializeScopes(input.scopes ?? [GOOGLE_CALENDAR_EVENTS_SCOPE]),
      accessTokenCipher: access.cipher,
      accessTokenIv: access.iv,
      accessTokenTag: access.tag,
      refreshTokenCipher: refresh.cipher,
      refreshTokenIv: refresh.iv,
      refreshTokenTag: refresh.tag,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      status: "connected",
    })
    .onConflictDoUpdate({
      target: schema.googleCalendarConnection.organizationId,
      set: {
        googleAccountEmail: input.googleAccountEmail ?? null,
        calendarId: input.calendarId,
        scopes: serializeScopes(input.scopes ?? [GOOGLE_CALENDAR_EVENTS_SCOPE]),
        accessTokenCipher: access.cipher,
        accessTokenIv: access.iv,
        accessTokenTag: access.tag,
        refreshTokenCipher: refresh.cipher,
        refreshTokenIv: refresh.iv,
        refreshTokenTag: refresh.tag,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        status: "connected",
        updatedAt: new Date(),
      },
    });
}

export async function getGoogleCalendarConnection(
  organizationId: string
): Promise<GoogleCalendarConnection | null> {
  const rows = await getDb()
    .select()
    .from(schema.googleCalendarConnection)
    .where(scoped(schema.googleCalendarConnection.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toConnection(rows[0]) : null;
}

export async function markGoogleCalendarReconnectRequired(
  organizationId: string
): Promise<void> {
  await getDb()
    .update(schema.googleCalendarConnection)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(scoped(schema.googleCalendarConnection.organizationId, organizationId));
}

export async function saveGoogleCalendarSyncState(input: {
  organizationId: string;
  reservationId: string;
  googleEventId?: string | null;
  status: GoogleCalendarSyncState["status"];
  lastError?: string | null;
  lastSyncedAt?: Date | null;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.googleCalendarSync)
    .values({
      id: newId("googleCalendarSync"),
      organizationId: input.organizationId,
      reservationId: input.reservationId,
      googleEventId: input.googleEventId ?? null,
      status: input.status,
      attempts: input.status === "failed" ? 1 : 0,
      lastError: input.lastError ?? null,
      lastSyncedAt: input.lastSyncedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        schema.googleCalendarSync.organizationId,
        schema.googleCalendarSync.reservationId,
      ],
      set: {
        googleEventId: input.googleEventId ?? null,
        status: input.status,
        attempts:
          input.status === "failed"
            ? sql`${schema.googleCalendarSync.attempts} + 1`
            : schema.googleCalendarSync.attempts,
        lastError: input.lastError ?? null,
        lastSyncedAt: input.lastSyncedAt ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function getGoogleCalendarSyncState(input: {
  organizationId: string;
  reservationId: string;
}): Promise<GoogleCalendarSyncState | null> {
  const rows = await getDb()
    .select()
    .from(schema.googleCalendarSync)
    .where(
      and(
        eq(schema.googleCalendarSync.organizationId, input.organizationId),
        eq(schema.googleCalendarSync.reservationId, input.reservationId)
      )
    )
    .limit(1);
  return rows[0] ? toSyncState(rows[0]) : null;
}

type ConnectionRow = typeof schema.googleCalendarConnection.$inferSelect;
type SyncRow = typeof schema.googleCalendarSync.$inferSelect;

function toConnection(row: ConnectionRow): GoogleCalendarConnection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    googleAccountEmail: row.googleAccountEmail,
    calendarId: row.calendarId,
    scopes: parseScopes(row.scopes),
    accessToken: decryptSecret({
      cipher: row.accessTokenCipher,
      iv: row.accessTokenIv,
      tag: row.accessTokenTag,
    }),
    refreshToken: decryptSecret({
      cipher: row.refreshTokenCipher,
      iv: row.refreshTokenIv,
      tag: row.refreshTokenTag,
    }),
    accessTokenExpiresAt: new Date(row.accessTokenExpiresAt),
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function toSyncState(row: SyncRow): GoogleCalendarSyncState {
  return {
    ...row,
    lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function serializeScopes(scopes: string[]): string {
  return [...new Set(scopes)].sort().join(" ");
}

function parseScopes(scopes: string): string[] {
  return scopes.split(/\s+/).filter(Boolean);
}
