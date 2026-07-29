import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type CalendarConnectionSummary = {
  connected: boolean;
  googleAccountEmail: string | null;
  calendarId: string | null;
  scopes: string[];
  accessTokenExpiresAt: Date | null;
  status: "connected" | "reconnect_required" | "disabled" | "not_connected";
  updatedAt: Date | null;
};

export type CalendarSyncDashboardStatus =
  | "pending"
  | "synced"
  | "failed"
  | "deleted"
  | "reconnect_required";

export type CalendarSyncDashboardRow = {
  id: string;
  reservationId: string;
  googleEventId: string | null;
  status: CalendarSyncDashboardStatus;
  attempts: number;
  lastError: string | null;
  lastSyncedAt: Date | null;
  updatedAt: Date;
  reservation: {
    startsAt: Date;
    endsAt: Date;
    status: "confirmed" | "cancelled";
  } | null;
  resource: { id: string; name: string } | null;
  service: { id: string; name: string; durationMinutes: number } | null;
  contact: { id: string; name: string; phone: string } | null;
};

export type CalendarSyncDashboard = {
  connection: CalendarConnectionSummary;
  counts: Record<CalendarSyncDashboardStatus, number>;
  syncs: CalendarSyncDashboardRow[];
};

export interface CalendarDashboardRepository {
  getConnectionSummary(organizationId: string): Promise<CalendarConnectionSummary>;
  listSyncRows(input: {
    organizationId: string;
    status?: CalendarSyncDashboardStatus | "all";
    limit: number;
  }): Promise<CalendarSyncDashboardRow[]>;
}

export class CalendarDashboardService {
  constructor(private readonly repository: CalendarDashboardRepository) {}

  async getDashboard(input: {
    organizationId: string;
    status?: CalendarSyncDashboardStatus | "all";
    limit?: number;
  }): Promise<CalendarSyncDashboard> {
    const [connection, syncs] = await Promise.all([
      this.repository.getConnectionSummary(input.organizationId),
      this.repository.listSyncRows({
        organizationId: input.organizationId,
        status: input.status ?? "all",
        limit: input.limit ?? 100,
      }),
    ]);
    const counts = emptyCounts();
    const redactedSyncs = syncs.map((sync) => ({
      ...sync,
      lastError: redactCalendarError(sync.lastError),
    }));
    for (const sync of redactedSyncs) counts[sync.status] += 1;
    if (connection.status === "reconnect_required") {
      counts.reconnect_required += 1;
    }
    return { connection, counts, syncs: redactedSyncs };
  }
}

type Db = ReturnType<typeof getDb>;

export class DrizzleCalendarDashboardRepository implements CalendarDashboardRepository {
  constructor(private readonly db: Db = getDb()) {}

  async getConnectionSummary(organizationId: string): Promise<CalendarConnectionSummary> {
    const rows = await this.db
      .select({
        googleAccountEmail: schema.googleCalendarConnection.googleAccountEmail,
        calendarId: schema.googleCalendarConnection.calendarId,
        scopes: schema.googleCalendarConnection.scopes,
        accessTokenExpiresAt: schema.googleCalendarConnection.accessTokenExpiresAt,
        status: schema.googleCalendarConnection.status,
        updatedAt: schema.googleCalendarConnection.updatedAt,
      })
      .from(schema.googleCalendarConnection)
      .where(eq(schema.googleCalendarConnection.organizationId, organizationId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return {
        connected: false,
        googleAccountEmail: null,
        calendarId: null,
        scopes: [],
        accessTokenExpiresAt: null,
        status: "not_connected",
        updatedAt: null,
      };
    }
    return {
      connected: row.status === "connected",
      googleAccountEmail: row.googleAccountEmail,
      calendarId: row.calendarId,
      scopes: parseScopes(row.scopes),
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  async listSyncRows(input: {
    organizationId: string;
    status?: CalendarSyncDashboardStatus | "all";
    limit: number;
  }): Promise<CalendarSyncDashboardRow[]> {
    const baseStatus =
      input.status && input.status !== "all" && input.status !== "reconnect_required"
        ? eq(schema.googleCalendarSync.status, input.status)
        : undefined;
    const rows = await this.db
      .select({
        id: schema.googleCalendarSync.id,
        reservationId: schema.googleCalendarSync.reservationId,
        googleEventId: schema.googleCalendarSync.googleEventId,
        status: schema.googleCalendarSync.status,
        attempts: schema.googleCalendarSync.attempts,
        lastError: schema.googleCalendarSync.lastError,
        lastSyncedAt: schema.googleCalendarSync.lastSyncedAt,
        updatedAt: schema.googleCalendarSync.updatedAt,
        reservationStartsAt: schema.reservation.startsAt,
        reservationEndsAt: schema.reservation.endsAt,
        reservationStatus: schema.reservation.status,
        resourceId: schema.resource.id,
        resourceName: schema.resource.name,
        serviceId: schema.reservationService.id,
        serviceName: schema.reservationService.name,
        serviceDurationMinutes: schema.reservationService.durationMinutes,
        contactId: schema.contact.id,
        contactName: schema.contact.name,
        contactPhone: schema.contact.phone,
      })
      .from(schema.googleCalendarSync)
      .leftJoin(
        schema.reservation,
        eq(schema.googleCalendarSync.reservationId, schema.reservation.id)
      )
      .leftJoin(schema.resource, eq(schema.reservation.resourceId, schema.resource.id))
      .leftJoin(
        schema.reservationService,
        eq(schema.reservation.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.contact, eq(schema.reservation.contactId, schema.contact.id))
      .where(
        baseStatus
          ? and(eq(schema.googleCalendarSync.organizationId, input.organizationId), baseStatus)
          : eq(schema.googleCalendarSync.organizationId, input.organizationId)
      )
      .orderBy(desc(schema.googleCalendarSync.updatedAt))
      .limit(Math.min(Math.max(input.limit, 1), 200));

    return rows.map((row) => ({
      id: row.id,
      reservationId: row.reservationId,
      googleEventId: row.googleEventId,
      status: row.status,
      attempts: row.attempts,
      lastError: redactCalendarError(row.lastError),
      lastSyncedAt: row.lastSyncedAt,
      updatedAt: row.updatedAt,
      reservation:
        row.reservationStartsAt && row.reservationEndsAt && row.reservationStatus
          ? {
              startsAt: row.reservationStartsAt,
              endsAt: row.reservationEndsAt,
              status: row.reservationStatus,
            }
          : null,
      resource: row.resourceId ? { id: row.resourceId, name: row.resourceName ?? "" } : null,
      service: row.serviceId
        ? {
            id: row.serviceId,
            name: row.serviceName ?? "",
            durationMinutes: row.serviceDurationMinutes ?? 0,
          }
        : null,
      contact: row.contactId
        ? { id: row.contactId, name: row.contactName ?? "", phone: row.contactPhone ?? "" }
        : null,
    }));
  }
}

export function createCalendarDashboardService(): CalendarDashboardService {
  return new CalendarDashboardService(new DrizzleCalendarDashboardRepository());
}

export function serializeCalendarDashboard(dashboard: CalendarSyncDashboard) {
  return {
    connection: {
      ...dashboard.connection,
      accessTokenExpiresAt: dashboard.connection.accessTokenExpiresAt?.toISOString() ?? null,
      updatedAt: dashboard.connection.updatedAt?.toISOString() ?? null,
    },
    counts: dashboard.counts,
    syncs: dashboard.syncs.map((sync) => ({
      ...sync,
      lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
      updatedAt: sync.updatedAt.toISOString(),
      reservation: sync.reservation
        ? {
            ...sync.reservation,
            startsAt: sync.reservation.startsAt.toISOString(),
            endsAt: sync.reservation.endsAt.toISOString(),
          }
        : null,
    })),
  };
}

function emptyCounts(): Record<CalendarSyncDashboardStatus, number> {
  return {
    pending: 0,
    synced: 0,
    failed: 0,
    deleted: 0,
    reconnect_required: 0,
  };
}

function parseScopes(scopes: string): string[] {
  return scopes.split(/\s+/).filter(Boolean);
}

function redactCalendarError(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .slice(0, 500);
}
