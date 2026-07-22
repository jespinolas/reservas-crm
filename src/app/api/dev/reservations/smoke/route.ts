import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { mockGuard } from "@/lib/dev-guard";
import { getDb, schema } from "@/lib/db";
import {
  createReservationApiService,
  serializeHold,
  serializeReservation,
} from "@/server/reservations/api";

export const dynamic = "force-dynamic";

const smokeBodySchema = z.object({
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
  if (guard && !isReservationSmokeOverrideEnabled()) return guard;

  const body = await parseBody(req, smokeBodySchema);
  if (!body.ok) return body.response;
  const startsAt = body.data.startsAt ?? new Date("2026-07-20T21:00:00.000Z");
  const endsAt = body.data.endsAt ?? new Date("2026-07-20T22:00:00.000Z");
  const idempotencyKey = body.data.idempotencyKey ?? "dev-reservation-smoke-001";
  const confirm = body.data.confirm ?? false;

  if (endsAt <= startsAt) {
    return apiError(422, "invalid_body", "endsAt must be greater than startsAt");
  }

  await seedReservationSmokeFixture();
  const service = createReservationApiService();
  const hold = await service.createHold({
    organizationId: fixture.organizationId,
    body: {
      resourceId: fixture.resourceId,
      serviceId: fixture.serviceId,
      contactId: fixture.contactId,
      startsAt,
      endsAt,
      idempotencyKey,
    },
  });
  const reservation = confirm
    ? await service.confirmHold({
        organizationId: fixture.organizationId,
        holdId: hold.id,
      })
    : null;

  return Response.json({
    ok: true,
    fixture,
    hold: serializeHold(hold),
    reservation: reservation ? serializeReservation(reservation) : null,
  });
}

function isReservationSmokeOverrideEnabled(): boolean {
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

async function seedReservationSmokeFixture() {
  const db = getDb();
  await db
    .insert(schema.organization)
    .values({
      id: fixture.organizationId,
      name: "Reservation Smoke",
      slug: "reservation-smoke",
    })
    .onConflictDoNothing({ target: schema.organization.id });

  await db
    .insert(schema.businessConfiguration)
    .values({
      id: "bcfg_reservation_smoke",
      organizationId: fixture.organizationId,
      timezone: "America/Asuncion",
      defaultSlotMinutes: 60,
      defaultHoldMinutes: 10,
      holdsBlockAvailability: true,
    })
    .onConflictDoNothing({
      target: schema.businessConfiguration.organizationId,
    });

  await db
    .insert(schema.resource)
    .values({
      id: fixture.resourceId,
      organizationId: fixture.organizationId,
      name: "Cancha Smoke",
      description: "Synthetic non-production reservation smoke resource",
      kind: "football_field",
      location: "MSI smoke",
      capacity: 10,
      active: true,
      sortOrder: 0,
    })
    .onConflictDoNothing({ target: schema.resource.id });

  await db
    .insert(schema.reservationService)
    .values({
      id: fixture.serviceId,
      organizationId: fixture.organizationId,
      name: "Turno Smoke 60",
      description: "Synthetic non-production 60 minute service",
      durationMinutes: 60,
      active: true,
      sortOrder: 0,
    })
    .onConflictDoNothing({ target: schema.reservationService.id });

  const existingContact = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, fixture.organizationId),
        eq(schema.contact.id, fixture.contactId)
      )
    )
    .limit(1);
  if (!existingContact[0]) {
    await db.insert(schema.contact).values({
      id: fixture.contactId,
      organizationId: fixture.organizationId,
      phone: "595981000001",
      name: "Reservation Smoke Contact",
      notes: "Synthetic non-production contact for reservation API smoke tests",
    });
  }
}
