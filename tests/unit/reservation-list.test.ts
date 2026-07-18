import { describe, expect, it } from "vitest";
import {
  ReservationListService,
  serializeReservationListItem,
  type ReservationListItem,
  type ReservationListRepository,
} from "@/server/reservations/list";

const now = new Date("2026-07-18T12:00:00.000Z");

describe("ReservationListService", () => {
  it("lists organization-scoped reservations and active holds in chronological order", async () => {
    const service = new ReservationListService(new FakeReservationListRepository());

    const result = await service.listDashboard({ organizationId: "org_1", now });

    expect(result.items.map((item) => item.id)).toEqual(["hold_1", "rsv_1", "rsv_2"]);
    expect(result.summary).toEqual({
      confirmed: 1,
      cancelled: 1,
      activeHolds: 1,
    });
  });

  it("serializes list items without organization identifiers", () => {
    const item = reservationFixture({ organizationId: "org_secret" });

    const serialized = serializeReservationListItem(item);

    expect(serialized).toEqual({
      id: "rsv_1",
      type: "reservation",
      status: "confirmed",
      resource: { id: "res_1", name: "Cancha 1" },
      service: { id: "rsvc_1", name: "Turno 60", durationMinutes: 60 },
      contact: { id: "ct_1", name: "Ana", phone: "595981000000" },
      startsAt: "2026-07-18T14:00:00.000Z",
      endsAt: "2026-07-18T15:00:00.000Z",
      expiresAt: null,
    });
    expect(serialized).not.toHaveProperty("organizationId");
  });
});

class FakeReservationListRepository implements ReservationListRepository {
  private readonly reservations = [
    reservationFixture({ id: "rsv_other", organizationId: "org_2" }),
    reservationFixture(),
    reservationFixture({
      id: "rsv_2",
      status: "cancelled",
      startsAt: new Date("2026-07-18T16:00:00.000Z"),
      endsAt: new Date("2026-07-18T17:00:00.000Z"),
    }),
  ];
  private readonly holds = [
    holdFixture(),
    holdFixture({ id: "hold_expired", expiresAt: new Date("2026-07-18T11:59:00.000Z") }),
    holdFixture({ id: "hold_other", organizationId: "org_2" }),
  ];

  async listReservations(input: {
    organizationId: string;
    limit: number;
  }): Promise<ReservationListItem[]> {
    return this.reservations
      .filter((item) => item.organizationId === input.organizationId)
      .slice(0, input.limit)
      .map(stripOrganizationId);
  }

  async listActiveHolds(input: {
    organizationId: string;
    now: Date;
    limit: number;
  }): Promise<ReservationListItem[]> {
    return this.holds
      .filter(
        (item) =>
          item.organizationId === input.organizationId &&
          item.expiresAt !== null &&
          item.expiresAt > input.now
      )
      .slice(0, input.limit)
      .map(stripOrganizationId);
  }
}

type FakeReservationListItem = ReservationListItem & { organizationId: string };

function reservationFixture(
  overrides: Partial<FakeReservationListItem> = {}
): FakeReservationListItem {
  return {
    id: "rsv_1",
    organizationId: "org_1",
    type: "reservation",
    status: "confirmed",
    resource: { id: "res_1", name: "Cancha 1" },
    service: { id: "rsvc_1", name: "Turno 60", durationMinutes: 60 },
    contact: { id: "ct_1", name: "Ana", phone: "595981000000" },
    startsAt: new Date("2026-07-18T14:00:00.000Z"),
    endsAt: new Date("2026-07-18T15:00:00.000Z"),
    expiresAt: null,
    ...overrides,
  };
}

function holdFixture(overrides: Partial<FakeReservationListItem> = {}): FakeReservationListItem {
  return {
    ...reservationFixture({
      id: "hold_1",
      type: "hold",
      status: "active_hold",
      startsAt: new Date("2026-07-18T13:00:00.000Z"),
      endsAt: new Date("2026-07-18T14:00:00.000Z"),
      expiresAt: new Date("2026-07-18T12:10:00.000Z"),
    }),
    ...overrides,
  };
}

function stripOrganizationId(item: FakeReservationListItem): ReservationListItem {
  const { organizationId: _organizationId, ...rest } = item;
  return rest;
}
