import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createHoldBodySchema,
  createReservationApiService,
  reservationApiErrorResponse,
  serializeHold,
} from "@/server/reservations/api";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createHoldBodySchema);
  if (!body.ok) return body.response;

  try {
    const hold = await createReservationApiService().createHold({
      organizationId: session.organizationId,
      body: body.data,
    });
    return Response.json({ hold: serializeHold(hold) }, { status: 201 });
  } catch (error) {
    try {
      return reservationApiErrorResponse(error);
    } catch (unhandled) {
      console.error("[reservations] unhandled hold create error:", unhandled);
      return apiError(500, "internal", "Error interno");
    }
  }
});
