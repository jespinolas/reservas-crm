import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { apiError, parseBody } from "@/lib/api";
import {
  FootballReservationFlow,
} from "@/server/ai/football-reservation-flow";
import {
  ReservationToolExecutor,
  type ReservationToolAvailabilityReader,
} from "@/server/ai/reservation-tools";
import {
  createReservationApiService,
} from "@/server/reservations/api";
import type { AvailabilitySlot } from "@/server/reservations/availability";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  confirm: z.boolean().optional(),
});

const fixture = {
  organizationId: "org_reservation_smoke",
  resourceId: "res_reservation_smoke_field",
  serviceId: "rsvc_reservation_smoke_60",
  contactId: "ct_reservation_smoke_contact",
};

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard && !isFootballFlowSmokeEnabled()) return guard;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const startsAt = body.data.startsAt ?? new Date("2026-07-21T21:00:00.000Z");
  const endsAt = body.data.endsAt ?? new Date("2026-07-21T22:00:00.000Z");
  if (endsAt <= startsAt) {
    return apiError(422, "invalid_body", "endsAt must be greater than startsAt");
  }

  const flow = new FootballReservationFlow(
    new ReservationToolExecutor(
      createReservationApiService(),
      new SingleSlotAvailabilityReader({
        resourceId: fixture.resourceId,
        serviceId: fixture.serviceId,
        startsAt,
        endsAt,
      })
    )
  );
  const result = await flow.run(
    {
      resourceId: fixture.resourceId,
      serviceId: fixture.serviceId,
      startsAt,
      endsAt,
      idempotencyKey: body.data.idempotencyKey ?? "dev-football-flow-smoke-001",
      confirm: body.data.confirm ?? true,
    },
    {
      organizationId: fixture.organizationId,
      contactId: fixture.contactId,
    }
  );

  return Response.json({ ok: true, fixture, flow: result });
}

class SingleSlotAvailabilityReader implements ReservationToolAvailabilityReader {
  constructor(private readonly slot: AvailabilitySlot) {}

  async listSlots(): Promise<AvailabilitySlot[]> {
    return [this.slot];
  }
}

function isFootballFlowSmokeEnabled(): boolean {
  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const isLocalSmokeUrl =
    appBaseUrl.includes("localhost") ||
    appBaseUrl.includes("127.0.0.1") ||
    appBaseUrl.includes("100.115.130.116");
  return (
    process.env.RESERVAS_RESERVATION_SMOKE_ENABLED === "true" &&
    process.env.CRM_PROVISIONING_ACCEPT_RAW_TOKEN_SMOKE_ONLY === "true" &&
    isLocalSmokeUrl
  );
}
