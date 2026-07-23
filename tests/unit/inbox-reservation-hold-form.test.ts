import { describe, expect, it } from "vitest";
import { buildReservationHoldPayload } from "@/components/inbox/reservation-hold-form";
import type { ReservationServiceDto } from "@/lib/types";

const services: ReservationServiceDto[] = [
  {
    id: "rsvc_1",
    name: "Turno 60",
    description: null,
    durationMinutes: 60,
  },
];

const values = {
  conversationId: "conv_1",
  contactId: "contact_1",
  resourceId: "res_1",
  serviceId: "rsvc_1",
  localDate: "2026-07-24",
  localTime: "15:30",
};

describe("buildReservationHoldPayload", () => {
  it("builds hold payloads with service-derived end time", () => {
    const payload = buildReservationHoldPayload(values, services);

    expect(payload).toMatchObject({
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: "contact_1",
    });
    expect(new Date(payload.endsAt).getTime() - new Date(payload.startsAt).getTime()).toBe(
      60 * 60_000
    );
  });

  it("uses stable idempotency keys for the same slot", () => {
    const first = buildReservationHoldPayload(values, services);
    const second = buildReservationHoldPayload(values, services);
    const moved = buildReservationHoldPayload({ ...values, localTime: "16:30" }, services);

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.idempotencyKey).not.toBe(moved.idempotencyKey);
  });

  it("rejects incomplete form state before submitting", () => {
    expect(() =>
      buildReservationHoldPayload({ ...values, localTime: "" }, services)
    ).toThrow("time_required");
    expect(() => buildReservationHoldPayload(values, [])).toThrow("service_not_found");
  });
});
