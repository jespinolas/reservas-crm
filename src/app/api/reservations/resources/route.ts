import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createReservationCatalogService,
  ReservationCatalogError,
  resourceKindSchema,
  serializeResource,
} from "@/server/reservations/catalog";
import { z } from "zod";

export const dynamic = "force-dynamic";

const resourceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  kind: resourceKindSchema.default("other"),
  location: z.string().trim().max(240).nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(10000).default(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const GET = withAuth(async (session) => {
  const resources = await createReservationCatalogService().listResources(
    session.organizationId
  );
  return Response.json({ resources: resources.map(serializeResource) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, resourceBodySchema);
  if (!body.ok) return body.response;

  try {
    const resource = await createReservationCatalogService().createResource({
      organizationId: session.organizationId,
      ...body.data,
    });
    return Response.json({ resource: serializeResource(resource) }, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error);
  }
});

function catalogErrorResponse(error: unknown): Response {
  if (error instanceof ReservationCatalogError) {
    if (error.code === "duplicate") {
      return apiError(409, "duplicate_resource", "Ya existe un recurso activo con ese nombre");
    }
    return apiError(404, "resource_not_found", "Recurso no encontrado");
  }
  throw error;
}
