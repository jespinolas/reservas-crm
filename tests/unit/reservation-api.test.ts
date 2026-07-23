import { describe, expect, it } from "vitest";
import {
  BookingService,
  InMemoryBookingRepository,
} from "@/server/reservations/booking";
import {
  ReservationApiError,
  ReservationApiService,
  reservationApiErrorResponse,
  serializeHold,
  serializeReservation,
  type ReservationApiRepository,
} from "@/server/reservations/api";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";

const now = new Date("2026-07-18T12:00:00.000Z");

function fixture() {
  const bookingRepository = new InMemoryBookingRepository();
  const repository = new FakeReservationApiRepository();
  return {
    bookingRepository,
    repository,
    service: new ReservationApiService(
      repository,
      new BookingService(bookingRepository)
    ),
  };
}

describe("ReservationApiService", () => {
  it("creates holds with organization-scoped catalog data and default expiration", async () => {
    const { service } = fixture();

    const hold = await service.createHold({
      organizationId: "org_1",
      body: createHoldBody(),
      now,
    });

    expect(hold).toMatchObject({
      organizationId: "org_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      status: "active",
      idempotencyKey: "idem_1",
    });
    expect(hold.expiresAt.toISOString()).toBe("2026-07-18T12:15:00.000Z");
  });

  it("rejects missing scoped resources, services, and contacts", async () => {
    const { repository, service } = fixture();
    repository.resources.clear();
    await expect(
      service.createHold({ organizationId: "org_1", body: createHoldBody(), now })
    ).rejects.toMatchObject({ code: "resource_not_found" });

    const next = fixture();
    next.repository.services.clear();
    await expect(
      next.service.createHold({ organizationId: "org_1", body: createHoldBody(), now })
    ).rejects.toMatchObject({ code: "service_not_found" });

    await expect(
      fixture().service.createHold({
        organizationId: "org_1",
        body: createHoldBody({ contactId: "contact_missing" }),
        now,
      })
    ).rejects.toMatchObject({ code: "contact_not_found" });
  });

  it("returns conflict responses for overlapping holds", async () => {
    const { service } = fixture();
    await service.createHold({ organizationId: "org_1", body: createHoldBody(), now });

    await expect(
      service.createHold({
        organizationId: "org_1",
        body: createHoldBody({
          startsAt: new Date("2026-07-20T21:30:00.000Z"),
          endsAt: new Date("2026-07-20T22:30:00.000Z"),
          idempotencyKey: "idem_2",
        }),
        now,
      })
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("confirms holds idempotently", async () => {
    const { service } = fixture();
    const hold = await service.createHold({ organizationId: "org_1", body: createHoldBody(), now });

    const first = await service.confirmHold({ organizationId: "org_1", holdId: hold.id, now });
    const second = await service.confirmHold({ organizationId: "org_1", holdId: hold.id, now });

    expect(second.id).toBe(first.id);
    expect(serializeReservation(first)).toMatchObject({
      id: first.id,
      holdId: hold.id,
      status: "confirmed",
    });
  });

  it("serializes holds and reservations without organization identifiers", async () => {
    const { service } = fixture();
    const hold = await service.createHold({ organizationId: "org_1", body: createHoldBody(), now });
    const reservation = await service.confirmHold({
      organizationId: "org_1",
      holdId: hold.id,
      now,
    });

    expect(serializeHold(hold)).toEqual({
      id: hold.id,
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: null,
      startsAt: "2026-07-20T21:00:00.000Z",
      endsAt: "2026-07-20T22:00:00.000Z",
      expiresAt: "2026-07-18T12:15:00.000Z",
      status: "active",
      idempotencyKey: "idem_1",
    });
    expect(serializeReservation(reservation)).not.toHaveProperty("organizationId");
  });

  it("lists only active catalog entries without organization identifiers", async () => {
    const { service } = fixture();

    const catalog = await service.listActiveCatalog({ organizationId: "org_1" });

    expect(catalog).toEqual({
      resources: [
        {
          id: "res_1",
          name: "Cancha 1",
          description: null,
          kind: "football_field",
          location: null,
          capacity: 10,
        },
      ],
      services: [
        {
          id: "rsvc_1",
          name: "Turno 60",
          description: null,
          durationMinutes: 60,
        },
      ],
    });
  });

  it("maps deterministic API errors to HTTP responses", async () => {
    const response = reservationApiErrorResponse(new ReservationApiError("resource_not_found"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "resource_not_found",
        message: "Resource was not found",
      },
    });
  });
});

function createHoldBody(overrides: Record<string, unknown> = {}) {
  return {
    resourceId: "res_1",
    serviceId: "rsvc_1",
    contactId: null,
    startsAt: new Date("2026-07-20T21:00:00.000Z"),
    endsAt: new Date("2026-07-20T22:00:00.000Z"),
    idempotencyKey: "idem_1",
    ...overrides,
  };
}

class FakeReservationApiRepository implements ReservationApiRepository {
  readonly configurations = new Map<string, BusinessConfiguration>([
    [
      "org_1",
      {
        id: "bcfg_1",
        organizationId: "org_1",
        timezone: "America/Asuncion",
        defaultSlotMinutes: 60,
        defaultHoldMinutes: 15,
        holdsBlockAvailability: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  readonly resources = new Map<string, ReservableResource>([
    [
      "res_1",
      {
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
      },
    ],
    [
      "res_inactive",
      {
        id: "res_inactive",
        organizationId: "org_1",
        name: "Cancha inactiva",
        description: null,
        kind: "football_field",
        location: null,
        capacity: 10,
        active: false,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  readonly services = new Map<string, ReservationServiceDefinition>([
    [
      "rsvc_1",
      {
        id: "rsvc_1",
        organizationId: "org_1",
        name: "Turno 60",
        description: null,
        durationMinutes: 60,
        active: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      "rsvc_inactive",
      {
        id: "rsvc_inactive",
        organizationId: "org_1",
        name: "Turno inactivo",
        description: null,
        durationMinutes: 60,
        active: false,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  readonly contacts = new Set(["contact_1"]);

  async findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null> {
    return this.configurations.get(organizationId) ?? null;
  }

  async findResourceById(
    organizationId: string,
    id: string
  ): Promise<ReservableResource | null> {
    const resource = this.resources.get(id);
    return resource?.organizationId === organizationId ? resource : null;
  }

  async findReservationServiceById(
    organizationId: string,
    id: string
  ): Promise<ReservationServiceDefinition | null> {
    const service = this.services.get(id);
    return service?.organizationId === organizationId ? service : null;
  }

  async listResources(organizationId: string): Promise<ReservableResource[]> {
    return [...this.resources.values()].filter(
      (resource) => resource.organizationId === organizationId
    );
  }

  async listReservationServices(
    organizationId: string
  ): Promise<ReservationServiceDefinition[]> {
    return [...this.services.values()].filter(
      (service) => service.organizationId === organizationId
    );
  }

  async contactExists(_organizationId: string, id: string): Promise<boolean> {
    return this.contacts.has(id);
  }
}
