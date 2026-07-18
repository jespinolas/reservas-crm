import { z } from "zod";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import type { ReservableResource, ReservationServiceDefinition } from "@/server/reservations/catalog";

export type BookingHoldStatus = "active" | "expired" | "released" | "converted";
export type ReservationStatus = "confirmed" | "cancelled";

export type BookingHold = {
  id: string;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  contactId: string | null;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  status: BookingHoldStatus;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Reservation = {
  id: string;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  contactId: string | null;
  holdId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ReservationStatusHistory = {
  id: string;
  organizationId: string;
  reservationId: string;
  status: ReservationStatus;
  reason: string | null;
  createdAt: Date;
};

export interface BookingRepository {
  findHoldByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<BookingHold | null>;
  createHoldIfAvailable(input: {
    hold: BookingHold;
    now: Date;
  }): Promise<{ ok: true; hold: BookingHold } | { ok: false; code: "conflict" }>;
  findHoldById(organizationId: string, holdId: string): Promise<BookingHold | null>;
  findReservationByHoldId(organizationId: string, holdId: string): Promise<Reservation | null>;
  confirmHold(input: {
    hold: BookingHold;
    reservation: Reservation;
    history: ReservationStatusHistory;
    now: Date;
  }): Promise<
    | { ok: true; reservation: Reservation; hold: BookingHold }
    | { ok: false; code: "conflict" | "not_active" | "expired" }
  >;
  saveReservation(reservation: Reservation): Promise<void>;
}

export class BookingError extends Error {
  constructor(readonly code: "conflict" | "not_found" | "not_active" | "expired") {
    super(code);
    this.name = "BookingError";
  }
}

export class BookingService {
  constructor(private readonly repository: BookingRepository) {}

  async createHold(input: {
    organizationId: string;
    resource: ReservableResource;
    service: ReservationServiceDefinition;
    contactId?: string | null;
    startsAt: Date;
    endsAt: Date;
    expiresAt: Date;
    idempotencyKey: string;
    now?: Date;
  }): Promise<BookingHold> {
    const now = input.now ?? new Date();
    const parsed = holdInputSchema.parse(input);
    if (!input.resource.active || !input.service.active) throw new BookingError("not_active");

    const existing = await this.repository.findHoldByIdempotencyKey(
      parsed.organizationId,
      parsed.idempotencyKey
    );
    if (existing) return existing;

    const hold: BookingHold = {
      id: newId("bookingHold"),
      organizationId: parsed.organizationId,
      resourceId: parsed.resource.id,
      serviceId: parsed.service.id,
      contactId: parsed.contactId ?? null,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      expiresAt: parsed.expiresAt,
      status: "active",
      idempotencyKey: parsed.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.repository.createHoldIfAvailable({ hold, now });
    if (!result.ok) throw new BookingError(result.code);
    return result.hold;
  }

  async confirmHold(input: {
    organizationId: string;
    holdId: string;
    now?: Date;
  }): Promise<Reservation> {
    const organizationId = z.string().min(1).parse(input.organizationId);
    const holdId = z.string().min(1).parse(input.holdId);
    const existing = await this.repository.findReservationByHoldId(organizationId, holdId);
    if (existing) return existing;
    const hold = await this.repository.findHoldById(organizationId, holdId);
    if (!hold) throw new BookingError("not_found");

    const now = input.now ?? new Date();
    const reservation: Reservation = {
      id: newId("reservation"),
      organizationId: hold.organizationId,
      resourceId: hold.resourceId,
      serviceId: hold.serviceId,
      contactId: hold.contactId,
      holdId: hold.id,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    const history: ReservationStatusHistory = {
      id: newId("reservationStatusHistory"),
      organizationId: hold.organizationId,
      reservationId: reservation.id,
      status: "confirmed",
      reason: "hold_confirmed",
      createdAt: now,
    };
    const result = await this.repository.confirmHold({ hold, reservation, history, now });
    if (!result.ok) throw new BookingError(result.code);
    return result.reservation;
  }
}

export class InMemoryBookingRepository implements BookingRepository {
  readonly holds = new Map<string, BookingHold>();
  readonly reservations = new Map<string, Reservation>();
  readonly history: ReservationStatusHistory[] = [];

  async findHoldByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<BookingHold | null> {
    const hold = [...this.holds.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.idempotencyKey === idempotencyKey
    );
    return hold ? cloneHold(hold) : null;
  }

  async createHoldIfAvailable(input: {
    hold: BookingHold;
    now: Date;
  }): Promise<{ ok: true; hold: BookingHold } | { ok: false; code: "conflict" }> {
    if (this.hasConflict(input.hold, input.now)) return { ok: false, code: "conflict" };
    this.holds.set(input.hold.id, cloneHold(input.hold));
    return { ok: true, hold: cloneHold(input.hold) };
  }

  async findHoldById(organizationId: string, holdId: string): Promise<BookingHold | null> {
    const hold = this.holds.get(holdId);
    return hold?.organizationId === organizationId ? cloneHold(hold) : null;
  }

  async findReservationByHoldId(
    organizationId: string,
    holdId: string
  ): Promise<Reservation | null> {
    const reservation = [...this.reservations.values()].find(
      (candidate) => candidate.organizationId === organizationId && candidate.holdId === holdId
    );
    return reservation ? cloneReservation(reservation) : null;
  }

  async confirmHold(input: {
    hold: BookingHold;
    reservation: Reservation;
    history: ReservationStatusHistory;
    now: Date;
  }): Promise<
    | { ok: true; reservation: Reservation; hold: BookingHold }
    | { ok: false; code: "conflict" | "not_active" | "expired" }
  > {
    const current = this.holds.get(input.hold.id);
    if (!current || current.status !== "active") return { ok: false, code: "not_active" };
    if (current.expiresAt <= input.now) return { ok: false, code: "expired" };
    if (this.hasReservationConflict(input.reservation)) return { ok: false, code: "conflict" };

    const converted: BookingHold = {
      ...current,
      status: "converted",
      updatedAt: input.now,
    };
    this.holds.set(converted.id, cloneHold(converted));
    this.reservations.set(input.reservation.id, cloneReservation(input.reservation));
    this.history.push(cloneHistory(input.history));
    return {
      ok: true,
      hold: cloneHold(converted),
      reservation: cloneReservation(input.reservation),
    };
  }

  async saveReservation(reservation: Reservation): Promise<void> {
    this.reservations.set(reservation.id, cloneReservation(reservation));
  }

  private hasConflict(hold: BookingHold, now: Date): boolean {
    return (
      [...this.holds.values()].some(
        (candidate) =>
          candidate.organizationId === hold.organizationId &&
          candidate.resourceId === hold.resourceId &&
          candidate.status === "active" &&
          candidate.expiresAt > now &&
          overlaps(candidate, hold)
      ) || this.hasReservationConflict(hold)
    );
  }

  private hasReservationConflict(range: {
    organizationId: string;
    resourceId: string;
    startsAt: Date;
    endsAt: Date;
  }): boolean {
    return [...this.reservations.values()].some(
      (candidate) =>
        candidate.organizationId === range.organizationId &&
        candidate.resourceId === range.resourceId &&
        candidate.status === "confirmed" &&
        overlaps(candidate, range)
    );
  }
}

type BookingDb = ReturnType<typeof getDb>;

export class DrizzleBookingRepository implements BookingRepository {
  constructor(private readonly db: BookingDb = getDb()) {}

  async findHoldByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<BookingHold | null> {
    const rows = await this.db
      .select()
      .from(schema.bookingHold)
      .where(
        and(
          eq(schema.bookingHold.organizationId, organizationId),
          eq(schema.bookingHold.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return rows[0] ? rowToHold(rows[0]) : null;
  }

  async createHoldIfAvailable(input: {
    hold: BookingHold;
    now: Date;
  }): Promise<{ ok: true; hold: BookingHold } | { ok: false; code: "conflict" }> {
    return this.db.transaction(async (tx) => {
      await lockBookingResource(tx, input.hold.organizationId, input.hold.resourceId);
      const holdConflict = await tx
        .select({ id: schema.bookingHold.id })
        .from(schema.bookingHold)
        .where(
          and(
            eq(schema.bookingHold.organizationId, input.hold.organizationId),
            eq(schema.bookingHold.resourceId, input.hold.resourceId),
            eq(schema.bookingHold.status, "active"),
            gt(schema.bookingHold.expiresAt, input.now),
            lt(schema.bookingHold.startsAt, input.hold.endsAt),
            gt(schema.bookingHold.endsAt, input.hold.startsAt)
          )
        )
        .limit(1);
      if (holdConflict[0]) return { ok: false, code: "conflict" };

      const reservationConflict = await tx
        .select({ id: schema.reservation.id })
        .from(schema.reservation)
        .where(
          and(
            eq(schema.reservation.organizationId, input.hold.organizationId),
            eq(schema.reservation.resourceId, input.hold.resourceId),
            eq(schema.reservation.status, "confirmed"),
            lt(schema.reservation.startsAt, input.hold.endsAt),
            gt(schema.reservation.endsAt, input.hold.startsAt)
          )
        )
        .limit(1);
      if (reservationConflict[0]) return { ok: false, code: "conflict" };

      const inserted = await tx
        .insert(schema.bookingHold)
        .values(holdToRow(input.hold))
        .onConflictDoNothing({
          target: [schema.bookingHold.organizationId, schema.bookingHold.idempotencyKey],
        })
        .returning();
      return inserted[0]
        ? { ok: true, hold: rowToHold(inserted[0]) }
        : { ok: false, code: "conflict" };
    });
  }

  async findHoldById(organizationId: string, holdId: string): Promise<BookingHold | null> {
    const rows = await this.db
      .select()
      .from(schema.bookingHold)
      .where(
        and(eq(schema.bookingHold.organizationId, organizationId), eq(schema.bookingHold.id, holdId))
      )
      .limit(1);
    return rows[0] ? rowToHold(rows[0]) : null;
  }

  async findReservationByHoldId(
    organizationId: string,
    holdId: string
  ): Promise<Reservation | null> {
    const rows = await this.db
      .select()
      .from(schema.reservation)
      .where(
        and(
          eq(schema.reservation.organizationId, organizationId),
          eq(schema.reservation.holdId, holdId)
        )
      )
      .limit(1);
    return rows[0] ? rowToReservation(rows[0]) : null;
  }

  async confirmHold(input: {
    hold: BookingHold;
    reservation: Reservation;
    history: ReservationStatusHistory;
    now: Date;
  }): Promise<
    | { ok: true; reservation: Reservation; hold: BookingHold }
    | { ok: false; code: "conflict" | "not_active" | "expired" }
  > {
    return this.db.transaction(async (tx) => {
      await lockBookingResource(tx, input.hold.organizationId, input.hold.resourceId);
      const currentRows = await tx
        .select()
        .from(schema.bookingHold)
        .where(
          and(
            eq(schema.bookingHold.organizationId, input.hold.organizationId),
            eq(schema.bookingHold.id, input.hold.id)
          )
        )
        .limit(1);
      const current = currentRows[0] ? rowToHold(currentRows[0]) : null;
      if (!current || current.status !== "active") return { ok: false, code: "not_active" };
      if (current.expiresAt <= input.now) return { ok: false, code: "expired" };

      const reservationConflict = await tx
        .select({ id: schema.reservation.id })
        .from(schema.reservation)
        .where(
          and(
            eq(schema.reservation.organizationId, input.reservation.organizationId),
            eq(schema.reservation.resourceId, input.reservation.resourceId),
            eq(schema.reservation.status, "confirmed"),
            ne(schema.reservation.holdId, input.hold.id),
            lt(schema.reservation.startsAt, input.reservation.endsAt),
            gt(schema.reservation.endsAt, input.reservation.startsAt)
          )
        )
        .limit(1);
      if (reservationConflict[0]) return { ok: false, code: "conflict" };

      const inserted = await tx
        .insert(schema.reservation)
        .values(reservationToRow(input.reservation))
        .onConflictDoNothing({ target: schema.reservation.holdId })
        .returning();
      if (!inserted[0]) return { ok: false, code: "conflict" };

      await tx.insert(schema.reservationStatusHistory).values(historyToRow(input.history));

      const updated = await tx
        .update(schema.bookingHold)
        .set({ status: "converted", updatedAt: input.now })
        .where(
          and(
            eq(schema.bookingHold.organizationId, input.hold.organizationId),
            eq(schema.bookingHold.id, input.hold.id),
            eq(schema.bookingHold.status, "active")
          )
        )
        .returning();
      if (!updated[0]) return { ok: false, code: "not_active" };

      return {
        ok: true,
        reservation: rowToReservation(inserted[0]),
        hold: rowToHold(updated[0]),
      };
    });
  }

  async saveReservation(reservation: Reservation): Promise<void> {
    await this.db.insert(schema.reservation).values(reservationToRow(reservation));
  }
}

export function bookingResourceLockScope(organizationId: string, resourceId: string): string {
  return `booking:${organizationId}:${resourceId}`;
}

async function lockBookingResource(
  tx: { execute: (query: string | SQLWrapper) => unknown },
  organizationId: string,
  resourceId: string
): Promise<void> {
  const lockScope = bookingResourceLockScope(organizationId, resourceId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))`);
}

const holdInputSchema = z
  .object({
    organizationId: z.string().min(1),
    resource: z.object({
      id: z.string().min(1),
      active: z.boolean(),
    }),
    service: z.object({
      id: z.string().min(1),
      active: z.boolean(),
    }),
    contactId: z.string().min(1).nullable().optional(),
    startsAt: z.date(),
    endsAt: z.date(),
    expiresAt: z.date(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .refine((input) => input.endsAt > input.startsAt, {
    message: "endsAt must be greater than startsAt",
  })
  .refine((input) => input.expiresAt > new Date(0), {
    message: "expiresAt is required",
  });

function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date }
): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

function cloneHold(hold: BookingHold): BookingHold {
  return {
    ...hold,
    startsAt: new Date(hold.startsAt),
    endsAt: new Date(hold.endsAt),
    expiresAt: new Date(hold.expiresAt),
    createdAt: new Date(hold.createdAt),
    updatedAt: new Date(hold.updatedAt),
  };
}

function cloneReservation(reservation: Reservation): Reservation {
  return {
    ...reservation,
    startsAt: new Date(reservation.startsAt),
    endsAt: new Date(reservation.endsAt),
    createdAt: new Date(reservation.createdAt),
    updatedAt: new Date(reservation.updatedAt),
  };
}

function cloneHistory(history: ReservationStatusHistory): ReservationStatusHistory {
  return {
    ...history,
    createdAt: new Date(history.createdAt),
  };
}

function holdToRow(hold: BookingHold): typeof schema.bookingHold.$inferInsert {
  return { ...hold };
}

function reservationToRow(reservation: Reservation): typeof schema.reservation.$inferInsert {
  return { ...reservation };
}

function historyToRow(
  history: ReservationStatusHistory
): typeof schema.reservationStatusHistory.$inferInsert {
  return { ...history };
}

function rowToHold(row: typeof schema.bookingHold.$inferSelect): BookingHold {
  return cloneHold(row);
}

function rowToReservation(row: typeof schema.reservation.$inferSelect): Reservation {
  return cloneReservation(row);
}
