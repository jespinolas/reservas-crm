import { describe, expect, it } from "vitest";
import {
  CalendarDashboardService,
  serializeCalendarDashboard,
  type CalendarDashboardRepository,
} from "@/server/calendar/dashboard";

describe("CalendarDashboardService", () => {
  it("returns redacted connection and sync diagnostics without token fields", async () => {
    const service = new CalendarDashboardService(new FakeCalendarDashboardRepository());

    const dashboard = await service.getDashboard({
      organizationId: "org_1",
      status: "all",
    });
    const serialized = serializeCalendarDashboard(dashboard);

    expect(serialized.connection).toMatchObject({
      connected: false,
      status: "reconnect_required",
      calendarId: "primary",
    });
    expect(serialized.counts.failed).toBe(1);
    expect(serialized.counts.reconnect_required).toBe(1);
    expect(JSON.stringify(serialized)).not.toContain("secret-token");
    expect(JSON.stringify(serialized)).not.toContain("refreshToken");
    expect(serialized.syncs[0]?.lastError).toContain("[redacted]");
  });
});

class FakeCalendarDashboardRepository implements CalendarDashboardRepository {
  async getConnectionSummary() {
    return {
      connected: false,
      googleAccountEmail: "owner@example.com",
      calendarId: "primary",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      accessTokenExpiresAt: new Date("2026-07-25T12:00:00.000Z"),
      status: "reconnect_required" as const,
      updatedAt: new Date("2026-07-25T12:00:00.000Z"),
    };
  }

  async listSyncRows() {
    return [
      {
        id: "sync_1",
        reservationId: "rsv_1",
        googleEventId: "event_1",
        status: "failed" as const,
        attempts: 2,
        lastError: "401 access_token=secret-token",
        lastSyncedAt: null,
        updatedAt: new Date("2026-07-25T12:00:00.000Z"),
        reservation: {
          startsAt: new Date("2026-07-25T15:00:00.000Z"),
          endsAt: new Date("2026-07-25T16:00:00.000Z"),
          status: "confirmed" as const,
        },
        resource: { id: "res_1", name: "Cancha 1" },
        service: { id: "svc_1", name: "Turno 60", durationMinutes: 60 },
        contact: { id: "ct_1", name: "Ana", phone: "595981000000" },
      },
    ];
  }
}
