import { describe, expect, it } from "vitest";
import {
  InMemoryReservationCatalogRepository,
  ReservationCatalogError,
  ReservationCatalogService,
} from "@/server/reservations/catalog";

const now = new Date("2026-07-18T12:00:00.000Z");

function catalog() {
  const repository = new InMemoryReservationCatalogRepository();
  return new ReservationCatalogService(repository);
}

describe("ReservationCatalogService", () => {
  it("creates default business configuration and supports deterministic updates", async () => {
    const service = catalog();

    const initial = await service.getOrCreateBusinessConfiguration({
      organizationId: "org_1",
      now,
    });
    expect(initial).toMatchObject({
      organizationId: "org_1",
      timezone: "America/Asuncion",
      defaultSlotMinutes: 60,
      defaultHoldMinutes: 10,
      holdsBlockAvailability: true,
    });

    const updated = await service.updateBusinessConfiguration({
      organizationId: "org_1",
      timezone: "America/Montevideo",
      defaultSlotMinutes: 30,
      defaultHoldMinutes: 15,
      holdsBlockAvailability: false,
      now: new Date("2026-07-18T12:05:00.000Z"),
    });
    expect(updated).toMatchObject({
      id: initial.id,
      timezone: "America/Montevideo",
      defaultSlotMinutes: 30,
      defaultHoldMinutes: 15,
      holdsBlockAvailability: false,
    });
  });

  it("creates and lists organization-scoped resources", async () => {
    const service = catalog();

    const resource = await service.createResource({
      organizationId: "org_1",
      name: "Cancha 1",
      kind: "football_field",
      location: "Complejo Norte",
      capacity: 10,
      sortOrder: 2,
      now,
    });
    await service.createResource({
      organizationId: "org_1",
      name: "Cancha 0",
      kind: "football_field",
      sortOrder: 1,
      now,
    });
    await service.createResource({
      organizationId: "org_2",
      name: "Cancha 1",
      kind: "football_field",
      now,
    });

    expect(resource).toMatchObject({
      organizationId: "org_1",
      name: "Cancha 1",
      kind: "football_field",
      capacity: 10,
      active: true,
    });
    await expect(service.listResources("org_1")).resolves.toMatchObject([
      { name: "Cancha 0" },
      { name: "Cancha 1" },
    ]);
  });

  it("rejects duplicate active resource names per organization but allows reuse after disable", async () => {
    const service = catalog();
    const resource = await service.createResource({
      organizationId: "org_1",
      name: "Cancha 1",
      kind: "football_field",
      now,
    });

    await expect(
      service.createResource({
        organizationId: "org_1",
        name: "Cancha 1",
        kind: "football_field",
        now,
      })
    ).rejects.toMatchObject({ code: "duplicate" });

    const disabled = await service.disableResource({
      organizationId: "org_1",
      id: resource.id,
      now,
    });
    expect(disabled.active).toBe(false);
    await expect(
      service.createResource({
        organizationId: "org_1",
        name: "Cancha 1",
        kind: "football_field",
        now,
      })
    ).resolves.toMatchObject({ active: true });
  });

  it("does not allow cross-organization resource updates", async () => {
    const service = catalog();
    const resource = await service.createResource({
      organizationId: "org_1",
      name: "Cancha 1",
      kind: "football_field",
      now,
    });

    await expect(
      service.updateResource({
        organizationId: "org_2",
        id: resource.id,
        name: "Cancha editada",
        now,
      })
    ).rejects.toBeInstanceOf(ReservationCatalogError);
  });

  it("creates services and rejects duplicate active service names per organization", async () => {
    const service = catalog();

    await expect(
      service.createReservationService({
        organizationId: "org_1",
        name: "Futbol 5 - 60 minutos",
        durationMinutes: 60,
        now,
      })
    ).resolves.toMatchObject({
      organizationId: "org_1",
      name: "Futbol 5 - 60 minutos",
      durationMinutes: 60,
      active: true,
    });
    await expect(
      service.createReservationService({
        organizationId: "org_1",
        name: "Futbol 5 - 60 minutos",
        durationMinutes: 90,
        now,
      })
    ).rejects.toMatchObject({ code: "duplicate" });
    await expect(
      service.createReservationService({
        organizationId: "org_2",
        name: "Futbol 5 - 60 minutos",
        durationMinutes: 60,
        now,
      })
    ).resolves.toMatchObject({ organizationId: "org_2" });
  });

  it("disables services instead of deleting them", async () => {
    const service = catalog();
    const reservationService = await service.createReservationService({
      organizationId: "org_1",
      name: "Turno 90",
      durationMinutes: 90,
      now,
    });

    const disabled = await service.disableReservationService({
      organizationId: "org_1",
      id: reservationService.id,
      now: new Date("2026-07-18T12:10:00.000Z"),
    });

    expect(disabled).toMatchObject({
      id: reservationService.id,
      active: false,
    });
    await expect(service.listReservationServices("org_1")).resolves.toMatchObject([
      { id: reservationService.id, active: false },
    ]);
  });
});
