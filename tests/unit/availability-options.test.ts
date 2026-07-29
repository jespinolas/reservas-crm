import { describe, expect, it } from "vitest";
import {
  AvailabilityService,
  InMemoryAvailabilityRepository,
} from "@/server/reservations/availability";
import {
  AvailabilityOptionsError,
  AvailabilityOptionsService,
  InMemoryAvailabilityOptionsRepository,
} from "@/server/reservations/availability-options";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";

const now = new Date("2026-07-29T12:00:00.000Z");

function fixture() {
  const availabilityRepository = new InMemoryAvailabilityRepository();
  const optionsRepository = new InMemoryAvailabilityOptionsRepository();
  const service = new AvailabilityOptionsService(
    optionsRepository,
    new AvailabilityService(availabilityRepository)
  );
  optionsRepository.configuration = configuration();
  return { service, optionsRepository, availabilityRepository };
}

function configuration(): BusinessConfiguration {
  return {
    id: "bcfg_1",
    organizationId: "org_1",
    timezone: "America/Asuncion",
    defaultSlotMinutes: 60,
    defaultHoldMinutes: 10,
    holdsBlockAvailability: true,
    createdAt: now,
    updatedAt: now,
  };
}

function resource(overrides: Partial<ReservableResource>): ReservableResource {
  return {
    id: "res_1",
    organizationId: "org_1",
    name: "Casa 1",
    description: "Casa equipada.",
    kind: "house",
    location: null,
    capacity: 4,
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
    name: "Estadia",
    description: "Reserva por bloque.",
    durationMinutes: 60,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("AvailabilityOptionsService", () => {
  it("returns options across multiple active resources for one service", async () => {
    const { service, optionsRepository, availabilityRepository } = fixture();
    optionsRepository.services.set("rsvc_1", reservationService());
    optionsRepository.resources.set("res_1", resource({ id: "res_1", name: "Casa 1" }));
    optionsRepository.resources.set("res_2", resource({ id: "res_2", name: "Casa 2" }));
    await availabilityRepository.saveResourceSchedule({
      id: "rs_1",
      organizationId: "org_1",
      resourceId: "res_1",
      dayOfWeek: 6,
      startMinute: 15 * 60,
      endMinute: 17 * 60,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await availabilityRepository.saveResourceSchedule({
      id: "rs_2",
      organizationId: "org_1",
      resourceId: "res_2",
      dayOfWeek: 6,
      startMinute: 15 * 60,
      endMinute: 17 * 60,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.findAvailableOptions({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      partySize: 4,
      now,
    });

    expect(result.options.map((option) => option.resource.name)).toEqual([
      "Casa 1",
      "Casa 2",
      "Casa 1",
      "Casa 2",
    ]);
    expect(result.diagnostics).toMatchObject({
      candidateResourceCount: 2,
      capacityRejectedCount: 0,
      scheduleSlotCount: 4,
      returnedCount: 4,
    });
  });

  it("returns CRM-calculated price and deposit with each available option", async () => {
    const { service, optionsRepository, availabilityRepository } = fixture();
    optionsRepository.services.set("rsvc_1", reservationService());
    optionsRepository.resources.set("res_1", resource({ id: "res_1", name: "Casa 1" }));
    optionsRepository.paymentRules.set("org_1:rsvc_1", {
      id: "rpay_1",
      organizationId: "org_1",
      serviceId: "rsvc_1",
      currency: "PYG",
      amountMinor: 500000,
      depositType: "percentage",
      depositAmountMinor: null,
      depositPercentage: 30,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await availabilityRepository.saveResourceSchedule({
      id: "rs_1",
      organizationId: "org_1",
      resourceId: "res_1",
      dayOfWeek: 6,
      startMinute: 15 * 60,
      endMinute: 16 * 60,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.findAvailableOptions({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      partySize: 4,
      now,
    });

    expect(result.options[0]?.priceEstimate).toMatchObject({
      amountMinor: 500000,
      currency: "PYG",
    });
    expect(result.options[0]?.depositDue).toMatchObject({
      amountMinor: 150000,
      currency: "PYG",
      type: "percentage",
    });
  });

  it("filters resources below requested party size", async () => {
    const { service, optionsRepository, availabilityRepository } = fixture();
    optionsRepository.services.set("rsvc_1", reservationService());
    optionsRepository.resources.set(
      "res_small",
      resource({ id: "res_small", name: "Casa chica", capacity: 4 })
    );
    optionsRepository.resources.set(
      "res_large",
      resource({ id: "res_large", name: "Casa grande", capacity: 10 })
    );
    for (const resourceId of ["res_small", "res_large"]) {
      await availabilityRepository.saveResourceSchedule({
        id: `rs_${resourceId}`,
        organizationId: "org_1",
        resourceId,
        dayOfWeek: 6,
        startMinute: 15 * 60,
        endMinute: 16 * 60,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const result = await service.findAvailableOptions({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      partySize: 8,
      now,
    });

    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.resource.name).toBe("Casa grande");
    expect(result.diagnostics.capacityRejectedCount).toBe(1);
  });

  it("removes slots blocked by active holds or confirmed reservations", async () => {
    const { service, optionsRepository, availabilityRepository } = fixture();
    optionsRepository.services.set("rsvc_1", reservationService());
    optionsRepository.resources.set("res_1", resource({ id: "res_1", name: "Casa 1" }));
    optionsRepository.resources.set("res_2", resource({ id: "res_2", name: "Casa 2" }));
    for (const resourceId of ["res_1", "res_2"]) {
      await availabilityRepository.saveResourceSchedule({
        id: `rs_${resourceId}`,
        organizationId: "org_1",
        resourceId,
        dayOfWeek: 6,
        startMinute: 15 * 60,
        endMinute: 16 * 60,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    optionsRepository.blockingRanges.push({
      resourceId: "res_1",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-08-02T00:00:00.000Z"),
      source: "hold",
    });

    const result = await service.findAvailableOptions({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      partySize: 4,
      now,
    });

    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.resource.name).toBe("Casa 2");
    expect(result.diagnostics.conflictRejectedCount).toBe(1);
  });

  it("rejects inactive or missing services", async () => {
    const { service, optionsRepository } = fixture();
    optionsRepository.services.set("rsvc_1", reservationService({ active: false }));

    await expect(
      service.findAvailableOptions({
        organizationId: "org_1",
        serviceId: "rsvc_1",
        rangeStart: new Date("2026-08-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
        now,
      })
    ).rejects.toBeInstanceOf(AvailabilityOptionsError);
  });
});
