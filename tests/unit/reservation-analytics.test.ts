import { describe, expect, it } from "vitest";
import {
  ReservationAnalyticsError,
  ReservationAnalyticsService,
  type ReservationAnalyticsRepository,
} from "@/server/analytics/reservations";

describe("ReservationAnalyticsService", () => {
  it("computes reservation metrics from scoped repository rows", async () => {
    const service = new ReservationAnalyticsService(new FakeAnalyticsRepository());

    const dashboard = await service.getDashboard({
      organizationId: "org_1",
      from: "2026-07-25",
      to: "2026-07-26",
    });

    expect(dashboard.summary).toMatchObject({
      confirmedReservations: 2,
      cancelledReservations: 1,
      activeHolds: 1,
      expiredHolds: 1,
      convertedHolds: 1,
    });
    expect(dashboard.series.topResources[0]).toMatchObject({
      id: "res_1",
      name: "Cancha 1",
      count: 2,
    });
    expect(dashboard.conversion).toEqual({
      available: false,
      reason: "conversation_attribution_unavailable",
    });
  });

  it("rejects invalid date ranges", async () => {
    const service = new ReservationAnalyticsService(new FakeAnalyticsRepository());

    await expect(
      service.getDashboard({
        organizationId: "org_1",
        from: "2026-08-01",
        to: "2026-07-01",
      })
    ).rejects.toBeInstanceOf(ReservationAnalyticsError);
  });
});

class FakeAnalyticsRepository implements ReservationAnalyticsRepository {
  async getTimezone() {
    return "America/Asuncion";
  }

  async listReservations() {
    return [
      reservation("rsv_1", "confirmed", "res_1", "Cancha 1", "svc_1", "Turno 60", "2026-07-25T14:00:00.000Z"),
      reservation("rsv_2", "confirmed", "res_1", "Cancha 1", "svc_2", "Turno 90", "2026-07-25T15:00:00.000Z"),
      reservation("rsv_3", "cancelled", "res_2", "Cancha 2", "svc_1", "Turno 60", "2026-07-26T14:00:00.000Z"),
    ];
  }

  async listHolds() {
    return [
      hold("hold_1", "active"),
      hold("hold_2", "expired"),
      hold("hold_3", "converted"),
    ];
  }
}

function reservation(
  id: string,
  status: "confirmed" | "cancelled",
  resourceId: string,
  resourceName: string,
  serviceId: string,
  serviceName: string,
  startsAt: string
) {
  return {
    id,
    status,
    resourceId,
    resourceName,
    serviceId,
    serviceName,
    startsAt: new Date(startsAt),
    endsAt: new Date(new Date(startsAt).getTime() + 60 * 60_000),
  };
}

function hold(id: string, status: "active" | "expired" | "released" | "converted") {
  return {
    id,
    status,
    resourceId: "res_1",
    serviceId: "svc_1",
    startsAt: new Date("2026-07-25T14:00:00.000Z"),
    endsAt: new Date("2026-07-25T15:00:00.000Z"),
  };
}
