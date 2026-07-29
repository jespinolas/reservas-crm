import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  AvailabilityOptionsError,
  createAvailabilityOptionsService,
  serializeAvailabilityOption,
} from "@/server/reservations/availability-options";

export const dynamic = "force-dynamic";

const availabilityOptionsBodySchema = z
  .object({
    serviceId: z.string().trim().min(1),
    rangeStart: z.coerce.date(),
    rangeEnd: z.coerce.date(),
    partySize: z.coerce.number().int().min(1).max(10000).nullable().optional(),
    maxOptions: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((input) => input.rangeEnd > input.rangeStart, {
    message: "rangeEnd must be after rangeStart",
    path: ["rangeEnd"],
  });

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, availabilityOptionsBodySchema);
  if (!body.ok) return body.response;

  try {
    const result = await createAvailabilityOptionsService().findAvailableOptions({
      organizationId: session.organizationId,
      serviceId: body.data.serviceId,
      rangeStart: body.data.rangeStart,
      rangeEnd: body.data.rangeEnd,
      partySize: body.data.partySize,
      maxOptions: body.data.maxOptions,
    });
    return Response.json({
      options: result.options.map(serializeAvailabilityOption),
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    if (error instanceof AvailabilityOptionsError) {
      if (error.code === "service_not_found") {
        return apiError(404, "service_not_found", "Servicio no encontrado");
      }
      return apiError(422, "invalid_range", "El rango de búsqueda no es válido");
    }
    throw error;
  }
});
