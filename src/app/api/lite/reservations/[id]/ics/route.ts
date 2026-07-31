import { and, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { buildReservationIcs } from "@/server/lite/calendar";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    const db = getDb();
    const [row] = await db
      .select({
        reservation: schema.reservation,
        resource: schema.resource,
        service: schema.reservationService,
        contact: schema.contact,
        organization: schema.organization,
      })
      .from(schema.reservation)
      .innerJoin(schema.resource, eq(schema.reservation.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.reservation.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.contact, eq(schema.reservation.contactId, schema.contact.id))
      .innerJoin(schema.organization, eq(schema.reservation.organizationId, schema.organization.id))
      .where(
        and(
          eq(schema.reservation.organizationId, session.organizationId),
          eq(schema.reservation.id, params.id),
          eq(schema.reservation.status, "confirmed")
        )
      )
      .limit(1);
    if (!row) return apiError(404, "reservation_not_found", "Reserva no encontrada");

    const ics = buildReservationIcs({
      businessName: row.organization.name,
      reservation: {
        id: row.reservation.id,
        resource: { id: row.resource.id, name: row.resource.name },
        service: {
          id: row.service.id,
          name: row.service.name,
          durationMinutes: row.service.durationMinutes,
        },
        contact: row.contact
          ? { id: row.contact.id, name: row.contact.name, phone: row.contact.phone }
          : null,
        startsAt: row.reservation.startsAt,
        endsAt: row.reservation.endsAt,
      },
    });
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="reserva-${row.reservation.id}.ics"`,
      },
    });
  }
);
