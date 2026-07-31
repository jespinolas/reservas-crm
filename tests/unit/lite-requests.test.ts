import { describe, expect, it } from "vitest";
import {
  LiteBookingRequestError,
  LiteBookingRequestService,
  type LiteBookingRequest,
  type LiteBookingRequestEvent,
  type LiteBookingRequestRepository,
} from "@/server/lite/requests";
import type { ReservableResource, ReservationServiceDefinition } from "@/server/reservations/catalog";
import type { Reservation, ReservationStatusHistory } from "@/server/reservations/booking";
import type { ServicePaymentRule } from "@/server/reservations/payment-rules";

const now = new Date("2026-07-31T12:00:00.000Z");

describe("Lite booking requests", () => {
  it("creates a public pending request without a hold or reservation", async () => {
    const repo = new FakeLiteRepo();
    const service = new LiteBookingRequestService(repo);

    const request = await service.submitPublicRequest({
      businessSlug: "casa-quinta",
      serviceId: "rsvc_1",
      resourceId: "res_1",
      customerName: "Ana",
      customerPhone: "+595981123456",
      partySize: 4,
      startsAt: new Date("2026-08-01T18:00:00.000Z"),
      now,
    });

    expect(request).toMatchObject({
      status: "new",
      paymentStatus: "not_required",
      reservationId: null,
      resourceId: "res_1",
    });
    expect(repo.events.at(-1)?.eventType).toBe("lite_request_submitted");
  });

  it("blocks confirmation until requested payment is approved", async () => {
    const repo = new FakeLiteRepo();
    const service = new LiteBookingRequestService(repo);
    const request = await service.submitPublicRequest({
      businessSlug: "casa-quinta",
      serviceId: "rsvc_1",
      resourceId: "res_1",
      customerName: "Ana",
      customerPhone: "+595981123456",
      partySize: 4,
      startsAt: new Date("2026-08-01T18:00:00.000Z"),
      now,
    });
    await service.requestPayment({
      organizationId: "org_1",
      requestId: request.id,
      actorUserId: "usr_1",
      expectedAmountMinor: 150000,
      currency: "PYG",
      instructions: "Transferencia redacted.",
      now,
    });

    await expect(
      service.confirm({
        organizationId: "org_1",
        requestId: request.id,
        actorUserId: "usr_1",
        now,
      })
    ).rejects.toMatchObject({ code: "payment_required" });
  });

  it("confirms manually after payment approval and records a reservation", async () => {
    const repo = new FakeLiteRepo();
    const service = new LiteBookingRequestService(repo);
    const request = await service.submitPublicRequest({
      businessSlug: "casa-quinta",
      serviceId: "rsvc_1",
      resourceId: "res_1",
      customerName: "Ana",
      customerPhone: "+595981123456",
      partySize: 4,
      startsAt: new Date("2026-08-01T18:00:00.000Z"),
      now,
    });
    await service.requestPayment({
      organizationId: "org_1",
      requestId: request.id,
      actorUserId: "usr_1",
      expectedAmountMinor: 150000,
      currency: "PYG",
      instructions: "Transferencia redacted.",
      now,
    });
    await service.approvePayment({
      organizationId: "org_1",
      requestId: request.id,
      actorUserId: "usr_1",
      now,
    });

    const result = await service.confirm({
      organizationId: "org_1",
      requestId: request.id,
      actorUserId: "usr_1",
      now,
    });

    expect(result.request.status).toBe("confirmed");
    expect(result.reservation.status).toBe("confirmed");
    expect(repo.reservations).toHaveLength(1);
  });

  it("rejects honeypot spam submissions", async () => {
    const service = new LiteBookingRequestService(new FakeLiteRepo());
    await expect(
      service.submitPublicRequest({
        businessSlug: "casa-quinta",
        serviceId: "rsvc_1",
        customerName: "Bot",
        customerPhone: "+595981123456",
        partySize: 1,
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        website: "https://spam.example",
      })
    ).rejects.toBeInstanceOf(LiteBookingRequestError);
  });
});

class FakeLiteRepo implements LiteBookingRequestRepository {
  requests = new Map<string, LiteBookingRequest>();
  events: LiteBookingRequestEvent[] = [];
  reservations: Reservation[] = [];
  resources = new Map<string, ReservableResource>([
    [
      "res_1",
      {
        id: "res_1",
        organizationId: "org_1",
        name: "Casa 3",
        description: null,
        kind: "house",
        location: null,
        capacity: 10,
        active: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  services = new Map<string, ReservationServiceDefinition>([
    [
      "rsvc_1",
      {
        id: "rsvc_1",
        organizationId: "org_1",
        name: "Estadía",
        description: null,
        durationMinutes: 1200,
        active: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);

  async findOrganizationBySlug(slug: string) {
    return slug === "casa-quinta" ? { id: "org_1", name: "Casa Quinta", slug } : null;
  }

  async listActiveResources() {
    return [...this.resources.values()];
  }

  async listActiveServices() {
    return [...this.services.values()];
  }

  async findResourceById(_organizationId: string, id: string) {
    return this.resources.get(id) ?? null;
  }

  async findServiceById(_organizationId: string, id: string) {
    return this.services.get(id) ?? null;
  }

  async findPaymentRule(): Promise<ServicePaymentRule | null> {
    return null;
  }

  async createRequest(request: LiteBookingRequest, event: LiteBookingRequestEvent) {
    this.requests.set(request.id, request);
    this.events.push(event);
    return request;
  }

  async findRequestById(_organizationId: string, id: string) {
    return this.requests.get(id) ?? null;
  }

  async listRequests() {
    return [...this.requests.values()].map((request) => ({
      ...request,
      resource: request.resourceId ? this.resources.get(request.resourceId)! : null,
      service: this.services.get(request.serviceId)!,
      duplicateRisk: false,
    }));
  }

  async updateRequest(request: LiteBookingRequest, event: LiteBookingRequestEvent) {
    this.requests.set(request.id, request);
    this.events.push(event);
    return request;
  }

  async createReservationFromRequest(input: {
    request: LiteBookingRequest;
    reservation: Reservation;
    history: ReservationStatusHistory;
    contact: { id: string; organizationId: string; name: string; phone: string; now: Date };
    event: LiteBookingRequestEvent;
    now: Date;
  }) {
    const reservation = { ...input.reservation, contactId: input.contact.id };
    this.reservations.push(reservation);
    this.requests.set(input.request.id, { ...input.request, reservationId: reservation.id });
    this.events.push(input.event);
    return {
      ok: true as const,
      request: this.requests.get(input.request.id)!,
      reservation,
    };
  }
}
