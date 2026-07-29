import { describe, expect, it } from "vitest";
import {
  SetupStatusService,
  type SetupStatusRepository,
} from "@/server/setup/status";

describe("SetupStatusService", () => {
  it("blocks reservation readiness until core deterministic setup exists", async () => {
    const service = new SetupStatusService(new FakeSetupStatusRepository({ activeSchedules: 0 }));

    const status = await service.getStatus("org_1");

    expect(status.reservationReady).toBe(false);
    expect(status.completed).toBe(false);
    expect(status.steps.find((step) => step.id === "availability")).toMatchObject({
      status: "incomplete",
    });
  });

  it("marks setup complete when reservation readiness fields exist", async () => {
    const service = new SetupStatusService(new FakeSetupStatusRepository({}));

    const status = await service.getStatus("org_1");

    expect(status.reservationReady).toBe(true);
    expect(status.completed).toBe(true);
    expect(status.integrationsReady).toBe(true);
  });
});

class FakeSetupStatusRepository implements SetupStatusRepository {
  constructor(
    private readonly overrides: Partial<Awaited<ReturnType<SetupStatusRepository["getSnapshot"]>>>
  ) {}

  async getSnapshot() {
    return {
      organizationName: "Reservas Demo",
      businessConfiguration: {
        timezone: "America/Asuncion",
        defaultSlotMinutes: 60,
        defaultHoldMinutes: 10,
      },
      activeResources: 1,
      activeServices: 1,
      activeSchedules: 7,
      whatsappConnected: true,
      googleCalendarConnected: true,
      aiConfigured: true,
      ...this.overrides,
    };
  }
}
