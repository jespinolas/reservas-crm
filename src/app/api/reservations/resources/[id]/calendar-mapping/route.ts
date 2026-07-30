import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createResourceCalendarMappingService,
  serializeResourceCalendarMapping,
} from "@/server/calendar/busy-blocks";
import { createReservationCatalogService } from "@/server/reservations/catalog";
import { z } from "zod";

export const dynamic = "force-dynamic";

const calendarMappingSchema = z.object({
  calendarId: z.string().trim().min(1).max(512).optional(),
  status: z.enum(["connected", "disabled"]).optional(),
});

export const GET = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    const exists = await resourceExists(session.organizationId, params.id);
    if (!exists) return apiError(404, "resource_not_found", "Recurso no encontrado");

    const mapping = await createResourceCalendarMappingService().getGoogleMapping({
      organizationId: session.organizationId,
      resourceId: params.id,
    });
    return Response.json({
      mapping: mapping ? serializeResourceCalendarMapping(mapping) : null,
    });
  }
);

export const PUT = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, calendarMappingSchema);
    if (!body.ok) return body.response;
    const params = await context.params;
    const exists = await resourceExists(session.organizationId, params.id);
    if (!exists) return apiError(404, "resource_not_found", "Recurso no encontrado");

    const service = createResourceCalendarMappingService();
    const mapping =
      body.data.status === "disabled" && !body.data.calendarId
        ? await service.disableGoogleMapping({
            organizationId: session.organizationId,
            resourceId: params.id,
          })
        : body.data.calendarId
          ? await service.configureGoogleMapping({
              organizationId: session.organizationId,
              resourceId: params.id,
              calendarId: body.data.calendarId,
              status: body.data.status,
            })
          : null;
    if (!mapping) {
      return apiError(400, "calendar_id_required", "Calendario requerido");
    }
    return Response.json({ mapping: serializeResourceCalendarMapping(mapping) });
  }
);

async function resourceExists(organizationId: string, resourceId: string): Promise<boolean> {
  const resources = await createReservationCatalogService().listResources(organizationId);
  return resources.some((resource) => resource.id === resourceId);
}
