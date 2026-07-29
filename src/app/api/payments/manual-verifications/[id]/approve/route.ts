import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createManualPaymentVerificationService,
  manualPaymentVerificationErrorResponse,
  serializeManualPaymentVerification,
} from "@/server/payments/manual-verifications";
import { serializeReservation } from "@/server/reservations/api";

export const dynamic = "force-dynamic";

const decisionBodySchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
});

export const POST = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, decisionBodySchema);
    if (!body.ok) return body.response;
    const params = await context.params;

    try {
      const result = await createManualPaymentVerificationService().approve({
        organizationId: session.organizationId,
        id: params.id,
        actorUserId: session.userId,
        note: body.data.note ?? null,
      });
      return Response.json({
        verification: serializeManualPaymentVerification(result.verification),
        reservation: serializeReservation(result.reservation),
      });
    } catch (error) {
      try {
        return manualPaymentVerificationErrorResponse(error);
      } catch (unhandled) {
        console.error("[payments] unhandled manual verification approve error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
