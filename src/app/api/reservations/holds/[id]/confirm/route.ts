import { apiError, withAuth } from "@/lib/api";
import {
  createReservationApiService,
  reservationApiErrorResponse,
  serializeReservation,
} from "@/server/reservations/api";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    try {
      const reservation = await createReservationApiService().confirmHold({
        organizationId: session.organizationId,
        holdId: params.id,
      });
      return Response.json({ reservation: serializeReservation(reservation) });
    } catch (error) {
      try {
        return reservationApiErrorResponse(error);
      } catch (unhandled) {
        console.error("[reservations] unhandled hold confirm error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
