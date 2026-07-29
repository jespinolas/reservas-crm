import { apiError, withAuth } from "@/lib/api";
import {
  createReservationCatalogService,
  ReservationCatalogError,
  serializeReservationService,
} from "@/server/reservations/catalog";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    try {
      const service = await createReservationCatalogService().enableReservationService({
        organizationId: session.organizationId,
        id: params.id,
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
