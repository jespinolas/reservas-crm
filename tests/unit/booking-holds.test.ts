import { describe, expect, it } from "vitest";
import {
  BookingError,
  BookingService,
  InMemoryBookingRepository,
  bookingResourceLockScope,
  type Reservation,
} from "@/server/reservations/booking";
import type {
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";

const now = new Date("2026-07-18T12:00:00.000Z");

function booking() {
  const repository = new InMemoryBookingRepository();
  return {
    repository,
    service: new BookingService(repository),
  };
}

function resource(overrides: Partial<ReservableResource> = {}): ReservableResource {
  return {
    id: "res_1",
    organizationId: "org_1",
    name: "Cancha 1",
    description: null,
    kind: "football_field",
    location: null,
    capacity: 10,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function reservationService(
  overrides: Partial<ReservationServiceDefinition> = {}
): ReservationServiceDefinition {
  return {
    id: "rsvc_1",
    organizationId: "org_1",
    name: "Turno 60",
    description: null,
    durationMinutes: 60,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function holdInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org_1",
    resource: resource(),
    service: reservationService(),
    startsAt: new Date("2026-07-20T21:00:00.000Z"),
    endsAt: new Date("2026-07-20T22:00:00.000Z"),
    expiresAt: new Date("2026-07-18T12:10:00.000Z"),
    idempotencyKey: "idem_1",
    now,
    ...overrides,
  };
}

describe("BookingService", () => {
  it("builds advisory lock scope from organization and resource", () => {
    expect(bookingResourceLockScope("org_1", "res_1")).toBe("booking:org_1:res_1");
    expect(bookingResourceLockScope("org_1", "res_2")).not.toBe(
      bookingResourceLockScope("org_1", "res_1")
    );
  });

  it("creates an active booking hold", async () => {
    const { service } = booking();

    await expect(service.createHold(holdInput())).resolves.toMatchObject({
      organizationId: "org_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      status: "active",
      idempotencyKey: "idem_1",
    });
  });

  it("refuses overlapping active holds for the same resource", async () => {
    const { service } = booking();
    await service.createHold(holdInput());

    await expect(
      service.createHold(
        holdInput({
          startsAt: new Date("2026-07-20T21:30:00.000Z"),
          endsAt: new Date("2026-07-20T22:30:00.000Z"),
          idempotencyKey: "idem_2",
        })
      )
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("allows adjacent holds and holds for other resources", async () => {
    const { service } = booking();
    await service.createHold(holdInput());

    await expect(
      service.createHold(
        holdInput({
          startsAt: new Date("2026-07-20T22:00:00.000Z"),
          endsAt: new Date("2026-07-20T23:00:00.000Z"),
          idempotencyKey: "idem_adjacent",
        })
      )
    ).resolves.toMatchObject({ idempotencyKey: "idem_adjacent" });
    await expect(
      service.createHold(
        holdInput({
          resource: resource({ id: "res_2" }),
          idempotencyKey: "idem_other_resource",
        })
      )
    ).resolves.toMatchObject({ resourceId: "res_2" });
  });

  it("does not let expired holds block new holds", async () => {
    const { service } = booking();
    await service.createHold(
      holdInput({
        expiresAt: new Date("2026-07-18T11:59:00.000Z"),
      })
    );

    await expect(
      service.createHold(
        holdInput({
          idempotencyKey: "idem_after_expired",
        })
      )
    ).resolves.toMatchObject({ idempotencyKey: "idem_after_expired" });
  });

  it("returns the same hold for repeated idempotency keys", async () => {
    const { service } = booking();
    const first = await service.createHold(holdInput());
    const second = await service.createHold(
      holdInput({
        startsAt: new Date("2026-07-20T23:00:00.000Z"),
        endsAt: new Date("2026-07-21T00:00:00.000Z"),
      })
    );

    expect(second).toMatchObject({
      id: first.id,
      startsAt: first.startsAt,
      endsAt: first.endsAt,
    });
  });

  it("confirms holds idempotently and records status history", async () => {
    const { repository, service } = booking();
    const hold = await service.createHold(holdInput());

    const first = await service.confirmHold({
      organizationId: "org_1",
      holdId: hold.id,
      now,
    });
    const second = await service.confirmHold({
      organizationId: "org_1",
      holdId: hold.id,
      now,
    });

    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      holdId: hold.id,
      status: "confirmed",
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
    });
    expect(repository.history).toHaveLength(1);
    expect(repository.holds.get(hold.id)?.status).toBe("converted");
  });

  it("refuses holds that overlap confirmed reservations", async () => {
    const { repository, service } = booking();
    const reservation: Reservation = {
      id: "rsv_existing",
      organizationId: "org_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: null,
      holdId: null,
      startsAt: new Date("2026-07-20T21:00:00.000Z"),
      endsAt: new Date("2026-07-20T22:00:00.000Z"),
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    await repository.saveReservation(reservation);

    await expect(service.createHold(holdInput())).rejects.toBeInstanceOf(BookingError);
  });

  it("returns no authority for disabled resources or services", async () => {
    const { service } = booking();

    await expect(
      service.createHold(holdInput({ resource: resource({ active: false }) }))
    ).rejects.toMatchObject({ code: "not_active" });
    await expect(
      service.createHold(holdInput({ service: reservationService({ active: false }) }))
    ).rejects.toMatchObject({ code: "not_active" });
  });
});
