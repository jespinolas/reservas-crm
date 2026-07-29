import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createReservationCatalogService,
  ReservationCatalogError,
  resourceKindSchema,
  serializeResource,
} from "@/server/reservations/catalog";
import { z } from "zod";

export const dynamic = "force-dynamic";

const resourcePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  kind: resourceKindSchema.optional(),
  location: z.string().trim().max(240).nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(10000).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const PATCH = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, resourcePatchSchema);
    if (!body.ok) return body.response;
    const params = await context.params;

    try {
      const resource = await createReservationCatalogService().updateResource({
        organizationId: session.organizationId,
        id: params.id,
        ...body.data,
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
