import { apiError, withAuth } from "@/lib/api";
import {
  createReservationCatalogService,
  ReservationCatalogError,
  serializeResource,
} from "@/server/reservations/catalog";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    try {
      const resource = await createReservationCatalogService().enableResource({
        organizationId: session.organizationId,
        id: params.id,
      });
      return Response.json({ resource: serializeResource(resource) });
    } catch (error) {
      if (error instanceof ReservationCatalogError) {
        if (error.code === "duplicate") {
          return apiError(409, "duplicate_resource", "Ya existe un recurso activo con ese nombre");
        }
        return apiError(404, "resource_not_found", "Recurso no encontrado");
      }
      throw error;
    }
  }
);
