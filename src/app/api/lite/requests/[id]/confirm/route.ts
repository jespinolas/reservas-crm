import { apiError, withAuth } from "@/lib/api";
import {
  createLiteBookingRequestService,
  liteRequestErrorResponse,
  serializeLiteRequest,
} from "@/server/lite/requests";
import { serializeReservation } from "@/server/reservations/api";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    try {
      const result = await createLiteBookingRequestService().confirm({
        organizationId: session.organizationId,
        requestId: params.id,
        actorUserId: session.userId,
      });
      return Response.json({
        request: serializeLiteRequest(result.request),
        reservation: serializeReservation(result.reservation),
      });
    } catch (error) {
      try {
        return liteRequestErrorResponse(error);
      } catch (unhandled) {
        console.error("[lite] unhandled confirm error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
