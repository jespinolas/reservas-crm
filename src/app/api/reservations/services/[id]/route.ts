import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createReservationCatalogService,
  ReservationCatalogError,
  serializeReservationService,
} from "@/server/reservations/catalog";
import { z } from "zod";

export const dynamic = "force-dynamic";

const servicePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const PATCH = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, servicePatchSchema);
    if (!body.ok) return body.response;
    const params = await context.params;

    try {
      const service = await createReservationCatalogService().updateReservationService({
        organizationId: session.organizationId,
        id: params.id,
        ...body.data,
      });
      return Response.json({ service: serializeReservationService(service) });
    } catch (error) {
      if (error instanceof ReservationCatalogError) {
        if (error.code === "duplicate") {
          return apiError(409, "duplicate_service", "Ya existe un servicio activo con ese nombre");
        }
        return apiError(404, "service_not_found", "Servicio no encontrado");
      }
      throw error;
    }
  }
);
