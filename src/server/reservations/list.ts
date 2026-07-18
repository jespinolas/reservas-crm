import { and, asc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type {
  ReservationListItemDto,
  ReservationListSummaryDto,
} from "@/lib/types";

export type ReservationListStatus = "confirmed" | "cancelled" | "active_hold";

export type ReservationListItem = {
  id: string;
  type: "reservation" | "hold";
  status: ReservationListStatus;
  resource: { id: string; name: string };
  service: { id: string; name: string; durationMinutes: number };
  contact: { id: string; name: string; phone: string } | null;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date | null;
};

export interface ReservationListRepository {
  listReservations(input: {
    organizationId: string;
    limit: number;
  }): Promise<ReservationListItem[]>;
  listActiveHolds(input: {
    organizationId: string;
    now: Date;
    limit: number;
  }): Promise<ReservationListItem[]>;
}

export class ReservationListService {
  constructor(private readonly repository: ReservationListRepository) {}

  async listDashboard(input: {
    organizationId: string;
    now?: Date;
    limit?: number;
  }): Promise<{
    items: ReservationListItem[];
    summary: ReservationListSummaryDto;
  }> {
    const limit = input.limit ?? 200;
    const now = input.now ?? new Date();
    const [reservations, holds] = await Promise.all([
      this.repository.listReservations({
        organizationId: input.organizationId,
        limit,
      }),
      this.repository.listActiveHolds({
        organizationId: input.organizationId,
        now,
        limit,
      }),
    ]);
    const items = [...holds, ...reservations]
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, limit);
    return {
      items,
      summary: {
        confirmed: reservations.filter((item) => item.status === "confirmed").length,
        cancelled: reservations.filter((item) => item.status === "cancelled").length,
        activeHolds: holds.length,
      },
    };
  }
}

type ReservationListDb = ReturnType<typeof getDb>;

export class DrizzleReservationListRepository implements ReservationListRepository {
  constructor(private readonly db: ReservationListDb = getDb()) {}

  async listReservations(input: {
    organizationId: string;
    limit: number;
  }): Promise<ReservationListItem[]> {
    const rows = await this.db
      .select({
        id: schema.reservation.id,
        status: schema.reservation.status,
        resourceId: schema.resource.id,
        resourceName: schema.resource.name,
        serviceId: schema.reservationService.id,
        serviceName: schema.reservationService.name,
        serviceDurationMinutes: schema.reservationService.durationMinutes,
        contactId: schema.contact.id,
        contactName: schema.contact.name,
        contactPhone: schema.contact.phone,
        startsAt: schema.reservation.startsAt,
        endsAt: schema.reservation.endsAt,
      })
      .from(schema.reservation)
      .innerJoin(schema.resource, eq(schema.reservation.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.reservation.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.contact, eq(schema.reservation.contactId, schema.contact.id))
      .where(eq(schema.reservation.organizationId, input.organizationId))
      .orderBy(asc(schema.reservation.startsAt))
      .limit(input.limit);
    return rows.map((row) => ({
      id: row.id,
      type: "reservation",
      status: row.status,
      resource: { id: row.resourceId, name: row.resourceName },
      service: {
        id: row.serviceId,
        name: row.serviceName,
        durationMinutes: row.serviceDurationMinutes,
      },
      contact: row.contactId
        ? { id: row.contactId, name: row.contactName ?? "", phone: row.contactPhone ?? "" }
        : null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      expiresAt: null,
    }));
  }

  async listActiveHolds(input: {
    organizationId: string;
    now: Date;
    limit: number;
  }): Promise<ReservationListItem[]> {
    const rows = await this.db
      .select({
        id: schema.bookingHold.id,
        resourceId: schema.resource.id,
        resourceName: schema.resource.name,
        serviceId: schema.reservationService.id,
        serviceName: schema.reservationService.name,
        serviceDurationMinutes: schema.reservationService.durationMinutes,
        contactId: schema.contact.id,
        contactName: schema.contact.name,
        contactPhone: schema.contact.phone,
        startsAt: schema.bookingHold.startsAt,
        endsAt: schema.bookingHold.endsAt,
        expiresAt: schema.bookingHold.expiresAt,
      })
      .from(schema.bookingHold)
      .innerJoin(schema.resource, eq(schema.bookingHold.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.bookingHold.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.contact, eq(schema.bookingHold.contactId, schema.contact.id))
      .where(
        and(
          eq(schema.bookingHold.organizationId, input.organizationId),
          eq(schema.bookingHold.status, "active"),
          gt(schema.bookingHold.expiresAt, input.now)
        )
      )
      .orderBy(asc(schema.bookingHold.startsAt))
      .limit(input.limit);
    return rows.map((row) => ({
      id: row.id,
      type: "hold",
      status: "active_hold",
      resource: { id: row.resourceId, name: row.resourceName },
      service: {
        id: row.serviceId,
        name: row.serviceName,
        durationMinutes: row.serviceDurationMinutes,
      },
      contact: row.contactId
        ? { id: row.contactId, name: row.contactName ?? "", phone: row.contactPhone ?? "" }
        : null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      expiresAt: row.expiresAt,
    }));
  }
}

export function createReservationListService(): ReservationListService {
  return new ReservationListService(new DrizzleReservationListRepository());
}

export function serializeReservationListItem(
  item: ReservationListItem
): ReservationListItemDto {
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    resource: item.resource,
    service: item.service,
    contact: item.contact,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
  };
}
