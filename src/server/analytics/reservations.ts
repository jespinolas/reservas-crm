import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type AnalyticsReservationRow = {
  id: string;
  status: "confirmed" | "cancelled";
  resourceId: string;
  resourceName: string;
  serviceId: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
};

export type AnalyticsHoldRow = {
  id: string;
  status: "active" | "expired" | "released" | "converted";
  resourceId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
};

export type ReservationAnalyticsDashboard = {
  range: { from: string; to: string; timezone: string };
  summary: {
    confirmedReservations: number;
    cancelledReservations: number;
    activeHolds: number;
    expiredHolds: number;
    convertedHolds: number;
  };
  series: {
    bookingsByDay: { day: string; count: number }[];
    bookingsByHour: { hour: number; count: number }[];
    topResources: { id: string; name: string; count: number }[];
    topServices: { id: string; name: string; count: number }[];
  };
  conversion: {
    available: false;
    reason: "conversation_attribution_unavailable";
  };
};

export interface ReservationAnalyticsRepository {
  getTimezone(organizationId: string): Promise<string>;
  listReservations(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsReservationRow[]>;
  listHolds(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsHoldRow[]>;
}

export class ReservationAnalyticsService {
  constructor(private readonly repository: ReservationAnalyticsRepository) {}

  async getDashboard(input: {
    organizationId: string;
    from?: string;
    to?: string;
    now?: Date;
  }): Promise<ReservationAnalyticsDashboard> {
    const timezone = await this.repository.getTimezone(input.organizationId);
    const range = resolveRange({ from: input.from, to: input.to, now: input.now });
    const [reservations, holds] = await Promise.all([
      this.repository.listReservations({
        organizationId: input.organizationId,
        from: range.fromDate,
        to: range.toDate,
      }),
      this.repository.listHolds({
        organizationId: input.organizationId,
        from: range.fromDate,
        to: range.toDate,
      }),
    ]);
    const confirmed = reservations.filter((row) => row.status === "confirmed");
    return {
      range: { from: range.from, to: range.to, timezone },
      summary: {
        confirmedReservations: confirmed.length,
        cancelledReservations: reservations.filter((row) => row.status === "cancelled").length,
        activeHolds: holds.filter((row) => row.status === "active").length,
        expiredHolds: holds.filter((row) => row.status === "expired").length,
        convertedHolds: holds.filter((row) => row.status === "converted").length,
      },
      series: {
        bookingsByDay: countByDay(confirmed, timezone),
        bookingsByHour: countByHour(confirmed, timezone),
        topResources: topBy(confirmed, (row) => row.resourceId, (row) => row.resourceName),
        topServices: topBy(confirmed, (row) => row.serviceId, (row) => row.serviceName),
      },
      conversion: {
        available: false,
        reason: "conversation_attribution_unavailable",
      },
    };
  }
}

type Db = ReturnType<typeof getDb>;

export class DrizzleReservationAnalyticsRepository implements ReservationAnalyticsRepository {
  constructor(private readonly db: Db = getDb()) {}

  async getTimezone(organizationId: string): Promise<string> {
    const rows = await this.db
      .select({ timezone: schema.businessConfiguration.timezone })
      .from(schema.businessConfiguration)
      .where(eq(schema.businessConfiguration.organizationId, organizationId))
      .limit(1);
    return rows[0]?.timezone ?? "America/Asuncion";
  }

  async listReservations(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsReservationRow[]> {
    return this.db
      .select({
        id: schema.reservation.id,
        status: schema.reservation.status,
        resourceId: schema.resource.id,
        resourceName: schema.resource.name,
        serviceId: schema.reservationService.id,
        serviceName: schema.reservationService.name,
        startsAt: schema.reservation.startsAt,
        endsAt: schema.reservation.endsAt,
      })
      .from(schema.reservation)
      .innerJoin(schema.resource, eq(schema.reservation.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.reservation.serviceId, schema.reservationService.id)
      )
      .where(
        and(
          eq(schema.reservation.organizationId, input.organizationId),
          gte(schema.reservation.startsAt, input.from),
          lte(schema.reservation.startsAt, input.to)
        )
      );
  }

  async listHolds(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsHoldRow[]> {
    return this.db
      .select({
        id: schema.bookingHold.id,
        status: schema.bookingHold.status,
        resourceId: schema.bookingHold.resourceId,
        serviceId: schema.bookingHold.serviceId,
        startsAt: schema.bookingHold.startsAt,
        endsAt: schema.bookingHold.endsAt,
      })
      .from(schema.bookingHold)
      .where(
        and(
          eq(schema.bookingHold.organizationId, input.organizationId),
          gte(schema.bookingHold.startsAt, input.from),
          lte(schema.bookingHold.startsAt, input.to)
        )
      );
  }
}

export function createReservationAnalyticsService(): ReservationAnalyticsService {
  return new ReservationAnalyticsService(new DrizzleReservationAnalyticsRepository());
}

function resolveRange(input: { from?: string; to?: string; now?: Date }) {
  const today = formatDay(input.now ?? new Date());
  const from = input.from ?? shiftDay(today, -6);
  const to = input.to ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new ReservationAnalyticsError("invalid_range", "Rango inválido");
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (fromDate > toDate) {
    throw new ReservationAnalyticsError("invalid_range", "El inicio debe ser anterior al fin");
  }
  if (toDate.getTime() - fromDate.getTime() > 93 * 24 * 60 * 60 * 1000) {
    throw new ReservationAnalyticsError("range_too_large", "El rango máximo es 93 días");
  }
  return { from, to, fromDate, toDate };
}

export class ReservationAnalyticsError extends Error {
  constructor(
    readonly code: "invalid_range" | "range_too_large",
    message: string
  ) {
    super(message);
    this.name = "ReservationAnalyticsError";
  }
}

function countByDay(rows: AnalyticsReservationRow[], timezone: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(row.startsAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}

function countByHour(rows: AnalyticsReservationRow[], timezone: string) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(row.startsAt)
    );
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, count]) => ({ hour, count }));
}

function topBy(
  rows: AnalyticsReservationRow[],
  key: (row: AnalyticsReservationRow) => string,
  label: (row: AnalyticsReservationRow) => string
) {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const row of rows) {
    const id = key(row);
    const current = counts.get(id) ?? { id, name: label(row), count: 0 };
    current.count += 1;
    counts.set(id, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
}
