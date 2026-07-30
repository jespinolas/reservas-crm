import { apiError, withAuth } from "@/lib/api";
import {
  createResourceCalendarMappingService,
  type ResourceBusyBlockStatus,
  serializeResourceBusyBlock,
} from "@/server/calendar/busy-blocks";
import { createReservationCatalogService } from "@/server/reservations/catalog";
import { z } from "zod";

export const dynamic = "force-dynamic";

const busyBlockStatusSchema = z.enum(["active", "cancelled"]);

export const GET = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    const exists = await resourceExists(session.organizationId, params.id);
    if (!exists) return apiError(404, "resource_not_found", "Recurso no encontrado");

    const url = new URL(req.url);
    const now = new Date();
    const rangeStart = parseDateParam(url.searchParams.get("rangeStart"), now);
    const rangeEnd = parseDateParam(
      url.searchParams.get("rangeEnd"),
      new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    );
    if (rangeEnd <= rangeStart) {
      return apiError(400, "invalid_range", "El final del rango debe ser posterior al inicio");
    }
    const statuses = parseStatuses(url.searchParams.getAll("status"));

    const busyBlocks = await createResourceCalendarMappingService().listBusyBlocks({
      organizationId: session.organizationId,
      resourceId: params.id,
      rangeStart,
      rangeEnd,
      statuses,
    });
    return Response.json({
      busyBlocks: busyBlocks.map(serializeResourceBusyBlock),
    });
  }
);

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = z.coerce.date().safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function parseStatuses(values: string[]): ResourceBusyBlockStatus[] | undefined {
  const statuses = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => busyBlockStatusSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  return statuses.length ? [...new Set(statuses)] : undefined;
}

async function resourceExists(organizationId: string, resourceId: string): Promise<boolean> {
  const resources = await createReservationCatalogService().listResources(organizationId);
  return resources.some((resource) => resource.id === resourceId);
}
