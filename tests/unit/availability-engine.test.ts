import { describe, expect, it } from "vitest";
import {
  AvailabilityService,
  InMemoryAvailabilityRepository,
} from "@/server/reservations/availability";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";

const now = new Date("2026-07-18T12:00:00.000Z");

function fixture() {
  const repository = new InMemoryAvailabilityRepository();
  return new AvailabilityService(repository);
}

function configuration(overrides: Partial<BusinessConfiguration> = {}): BusinessConfiguration {
  return {
    id: "bcfg_1",
    organizationId: "org_1",
    timezone: "America/Asuncion",
    defaultSlotMinutes: 60,
    defaultHoldMinutes: 10,
    holdsBlockAvailability: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
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

describe("AvailabilityService", () => {
  it("produces UTC slots from weekly schedules in the business timezone", async () => {
    const service = fixture();
    await service.createResourceSchedule({
      organizationId: "org_1",
      resourceId: "res_1",
      dayOfWeek: 1,
      startMinute: 18 * 60,
      endMinute: 21 * 60,
      now,
    });

    const slots = await service.listAvailableSlots({
      configuration: configuration(),
      resource: resource(),
      service: reservationService(),
      rangeStart: new Date("2026-07-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-21T00:00:00.000Z"),
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-07-20T21:00:00.000Z",
      "2026-07-20T22:00:00.000Z",
      "2026-07-20T23:00:00.000Z",
    ]);
  });

  it("removes slots that overlap closed exceptions", async () => {
    const service = fixture();
    await service.createResourceSchedule({
      organizationId: "org_1",
      resourceId: "res_1",
      dayOfWeek: 1,
      startMinute: 18 * 60,
      endMinute: 21 * 60,
      now,
    });
    await service.createScheduleException({
      organizationId: "org_1",
      resourceId: "res_1",
      localDate: "2026-07-20",
      startMinute: 19 * 60,
      endMinute: 20 * 60,
      kind: "unavailable",
      now,
    });

    const slots = await service.listAvailableSlots({
      configuration: configuration(),
      resource: resource(),
      service: reservationService(),
      rangeStart: new Date("2026-07-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-21T00:00:00.000Z"),
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-07-20T21:00:00.000Z",
      "2026-07-20T23:00:00.000Z",
    ]);
  });

  it("adds slots from open exceptions when no weekly schedule exists", async () => {
    const service = fixture();
    await service.createScheduleException({
      organizationId: "org_1",
      resourceId: "res_1",
      localDate: "2026-07-21",
      startMinute: 9 * 60,
      endMinute: 11 * 60,
      kind: "available",
      now,
    });

    const slots = await service.listAvailableSlots({
      configuration: configuration(),
      resource: resource(),
      service: reservationService(),
      rangeStart: new Date("2026-07-21T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-22T00:00:00.000Z"),
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-07-21T12:00:00.000Z",
      "2026-07-21T13:00:00.000Z",
    ]);
  });

  it("removes slots that overlap blackout periods", async () => {
    const service = fixture();
    await service.createResourceSchedule({
      organizationId: "org_1",
      resourceId: "res_1",
      dayOfWeek: 1,
      startMinute: 18 * 60,
      endMinute: 21 * 60,
      now,
    });
    await service.createBlackoutPeriod({
      organizationId: "org_1",
      resourceId: "res_1",
      startsAt: new Date("2026-07-20T22:30:00.000Z"),
      endsAt: new Date("2026-07-20T23:30:00.000Z"),
      now,
    });

    const slots = await service.listAvailableSlots({
      configuration: configuration(),
      resource: resource(),
      service: reservationService(),
      rangeStart: new Date("2026-07-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-21T00:30:00.000Z"),
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-07-20T21:00:00.000Z",
    ]);
  });

  it("returns no slots for disabled resources or services", async () => {
    const service = fixture();
    await service.createResourceSchedule({
      organizationId: "org_1",
      resourceId: "res_1",
      dayOfWeek: 1,
      startMinute: 18 * 60,
      endMinute: 21 * 60,
      now,
    });

    const input = {
      configuration: configuration(),
      rangeStart: new Date("2026-07-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-21T00:30:00.000Z"),
    };

    await expect(
      service.listAvailableSlots({
        ...input,
        resource: resource({ active: false }),
        service: reservationService(),
      })
    ).resolves.toEqual([]);
    await expect(
      service.listAvailableSlots({
        ...input,
        resource: resource(),
        service: reservationService({ active: false }),
      })
    ).resolves.toEqual([]);
  });
});
