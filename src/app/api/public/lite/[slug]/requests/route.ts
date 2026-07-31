import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import {
  createLiteBookingRequestService,
  liteRequestErrorResponse,
  serializeLiteRequest,
} from "@/server/lite/requests";

export const dynamic = "force-dynamic";

const publicRequestBodySchema = z.object({
  serviceId: z.string().trim().min(1),
  resourceId: z.string().trim().min(1).nullable().optional(),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(6).max(40),
  customerEmail: z.string().trim().email().nullable().optional(),
  partySize: z.coerce.number().int().min(1).max(10000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  customerNote: z.string().trim().max(1200).nullable().optional(),
  website: z.string().max(500).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const params = await context.params;
  const body = await parseBody(req, publicRequestBodySchema);
  if (!body.ok) return body.response;

  try {
    const request = await createLiteBookingRequestService().submitPublicRequest({
      businessSlug: params.slug,
      ...body.data,
    });
    return Response.json(
      {
        request: serializeLiteRequest(request),
        message: "Solicitud recibida. Está sujeta a confirmación del negocio.",
      },
      { status: 201 }
    );
  } catch (error) {
    try {
      return liteRequestErrorResponse(error);
    } catch (unhandled) {
      console.error("[lite] unhandled public request error:", unhandled);
      return apiError(500, "internal", "Error interno");
    }
  }
}
