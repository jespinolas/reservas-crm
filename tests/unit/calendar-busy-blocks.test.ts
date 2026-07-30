import { describe, expect, it } from "vitest";
import {
  AvailabilityService,
  InMemoryAvailabilityRepository,
} from "@/server/reservations/availability";
import {
  AvailabilityOptionsService,
  InMemoryAvailabilityOptionsRepository,
} from "@/server/reservations/availability-options";
import {
  InMemoryResourceCalendarBusyBlockRepository,
  MockCalendarBusyWindowProvider,
  ResourceCalendarMappingService,
  ResourceCalendarBusyBlockSyncService,
  busyBlocksToAvailabilityBlockingRanges,
  hashProviderEventId,
  serializeResourceBusyBlock,
  serializeResourceCalendarMapping,
} from "@/server/calendar/busy-blocks";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";

const now = new Date("2026-07-30T12:00:00.000Z");

function fixture() {
  const repository = new InMemoryResourceCalendarBusyBlockRepository();
  const provider = new MockCalendarBusyWindowProvider();
  const syncService = new ResourceCalendarBusyBlockSyncService(repository, provider);
  return { repository, provider, syncService };
}

describe("ResourceCalendarBusyBlockSyncService", () => {
  it("represents a per-resource Google Calendar mapping and redacts provider details", async () => {
    const { repository, provider, syncService } = fixture();
    provider.windows = [
      {
        providerEventId: "evt_private_1",
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-01T19:00:00.000Z"),
        summary: "Bloqueado por owner@example.com",
      },
    ];

    const result = await syncService.syncGoogleBusyBlocks({
      organizationId: "org_1",
      resourceId: "res_house_3",
      calendarId: "house3.owner@example.com",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping).toMatchObject({
      organizationId: "org_1",
      resourceId: "res_house_3",
      provider: "google",
      calendarIdRedacted: "ho***@example.com",
      status: "connected",
    });
    expect(JSON.stringify([...repository.busyBlocks.values()])).not.toContain("evt_private_1");
    expect(result.busyBlocks[0]?.summaryRedacted).toBe("Bloqueado por [redacted-email]");
  });

  it("imports mocked busy windows idempotently and deactivates removed provider events", async () => {
    const { repository, provider, syncService } = fixture();
    provider.windows = [
      {
        providerEventId: "evt_busy_1",
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-01T19:00:00.000Z"),
      },
    ];
    const input = {
      organizationId: "org_1",
      resourceId: "res_house_3",
      calendarId: "primary",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      now,
    };

    const first = await syncService.syncGoogleBusyBlocks(input);
    const second = await syncService.syncGoogleBusyBlocks(input);
    expect(first.ok && first.importedCount).toBe(1);
    expect(second.ok && second.importedCount).toBe(1);
    expect(repository.busyBlocks.size).toBe(1);

    provider.windows = [];
    const third = await syncService.syncGoogleBusyBlocks({
      ...input,
      now: new Date("2026-07-30T12:05:00.000Z"),
    });
    expect(third.ok && third.deactivatedCount).toBe(1);
    const blocks = await repository.listBusyBlocks({
      organizationId: "org_1",
      resourceId: "res_house_3",
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
    });
    expect(blocks[0]).toMatchObject({ status: "cancelled" });
  });

  it("records provider failure without creating reservations or active busy blocks", async () => {
    const { repository, provider, syncService } = fixture();
    provider.error = new Error("Google 503 for owner@example.com");

    const result = await syncService.syncGoogleBusyBlocks({
      organizationId: "org_1",
      resourceId: "res_house_3",
      calendarId: "house3.owner@example.com",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      now,
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "Google 503 for [redacted-email]",
    });
    expect([...repository.busyBlocks.values()]).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("confirmed");
  });

  it("converts active CRM busy blocks into availability exclusions", async () => {
    const { repository, provider, syncService } = fixture();
    provider.windows = [
      {
        providerEventId: "evt_house_3_blocked",
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-01T19:00:00.000Z"),
      },
    ];
    await syncService.syncGoogleBusyBlocks({
      organizationId: "org_1",
      resourceId: "res_house_3",
      calendarId: "primary",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      now,
    });

    const activeBlocks = await repository.listBusyBlocks({
      organizationId: "org_1",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      statuses: ["active"],
    });
    const optionsRepository = new InMemoryAvailabilityOptionsRepository();
    const availabilityRepository = new InMemoryAvailabilityRepository();
    optionsRepository.configuration = configuration();
    optionsRepository.services.set("rsvc_house", service());
    optionsRepository.resources.set("res_house_3", resource("res_house_3", "Casa 3"));
    optionsRepository.resources.set("res_house_4", resource("res_house_4", "Casa 4"));
    optionsRepository.blockingRanges.push(...busyBlocksToAvailabilityBlockingRanges(activeBlocks));
    for (const resourceId of ["res_house_3", "res_house_4"]) {
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

    const result = await new AvailabilityOptionsService(
      optionsRepository,
      new AvailabilityService(availabilityRepository)
    ).findAvailableOptions({
      organizationId: "org_1",
      serviceId: "rsvc_house",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      partySize: 4,
      now,
    });

    expect(result.options.map((option) => option.resource.name)).toEqual(["Casa 4"]);
    expect(result.diagnostics.conflictRejectedCount).toBe(1);
  });

  it("hashes provider event identifiers consistently without exposing raw IDs", () => {
    const hash = hashProviderEventId({
      provider: "google",
      calendarId: "primary",
      providerEventId: "evt_sensitive",
    });
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("evt_sensitive");
  });

  it("configures Google mappings without exposing raw calendar identifiers in API payloads", async () => {
    const repository = new InMemoryResourceCalendarBusyBlockRepository();
    const service = new ResourceCalendarMappingService(repository);

    const mapping = await service.configureGoogleMapping({
      organizationId: "org_1",
      resourceId: "res_house_3",
      calendarId: "house3.owner@example.com",
      now,
    });
    const payload = serializeResourceCalendarMapping(mapping);

    expect(mapping.calendarIdRedacted).toBe("ho***@example.com");
    expect(JSON.stringify(payload)).not.toContain("org_1");
    expect(JSON.stringify(payload)).not.toContain("house3.owner@example.com");
    expect(payload).toMatchObject({
      resourceId: "res_house_3",
      provider: "google",
      status: "connected",
    });
  });

  it("serializes busy blocks without organization scope or provider event hashes", async () => {
    const { repository, provider, syncService } = fixture();
    provider.windows = [
      {
        providerEventId: "evt_private_1",
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-01T19:00:00.000Z"),
      },
    ];

    const result = await syncService.syncGoogleBusyBlocks({
      organizationId: "org_1",
      resourceId: "res_house_3",
      calendarId: "primary",
      rangeStart: new Date("2026-08-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-08-02T00:00:00.000Z"),
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = serializeResourceBusyBlock(result.busyBlocks[0]!);
    expect(JSON.stringify(payload)).not.toContain("org_1");
    expect(JSON.stringify(payload)).not.toContain("evt_private_1");
    expect(JSON.stringify(payload)).not.toContain(
      result.busyBlocks[0]?.providerEventIdHash
    );
    expect(payload).toMatchObject({
      resourceId: "res_house_3",
      source: "google_calendar",
      status: "active",
    });
    expect(repository.busyBlocks.size).toBe(1);
  });
});

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

function resource(id: string, name: string): ReservableResource {
  return {
    id,
    organizationId: "org_1",
    name,
    description: null,
    kind: "house",
    location: null,
    capacity: 4,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function service(): ReservationServiceDefinition {
  return {
    id: "rsvc_house",
    organizationId: "org_1",
    name: "Estadía",
    description: null,
    durationMinutes: 60,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}
