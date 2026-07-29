import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createReservationCatalogService,
  ReservationCatalogError,
  serializeReservationService,
} from "@/server/reservations/catalog";
import { z } from "zod";

export const dynamic = "force-dynamic";

const serviceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const GET = withAuth(async (session) => {
  const services = await createReservationCatalogService().listReservationServices(
    session.organizationId
  );
  return Response.json({ services: services.map(serializeReservationService) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, serviceBodySchema);
  if (!body.ok) return body.response;

  try {
    const service = await createReservationCatalogService().createReservationService({
      organizationId: session.organizationId,
      ...body.data,
    });
    return Response.json(
      { service: serializeReservationService(service) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ReservationCatalogError) {
      if (error.code === "duplicate") {
        return apiError(409, "duplicate_service", "Ya existe un servicio activo con ese nombre");
      }
      return apiError(404, "service_not_found", "Servicio no encontrado");
    }
    throw error;
  }
});
