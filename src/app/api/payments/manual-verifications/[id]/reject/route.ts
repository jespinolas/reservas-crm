import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createManualPaymentVerificationService,
  manualPaymentVerificationErrorResponse,
  serializeManualPaymentVerification,
} from "@/server/payments/manual-verifications";

export const dynamic = "force-dynamic";

const rejectBodySchema = z.object({
  reason: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const POST = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, rejectBodySchema);
    if (!body.ok) return body.response;
    const params = await context.params;

    try {
      const verification = await createManualPaymentVerificationService().reject({
        organizationId: session.organizationId,
        id: params.id,
        actorUserId: session.userId,
        reason: body.data.reason ?? null,
        note: body.data.note ?? null,
      });
      return Response.json({ verification: serializeManualPaymentVerification(verification) });
    } catch (error) {
      try {
        return manualPaymentVerificationErrorResponse(error);
      } catch (unhandled) {
        console.error("[payments] unhandled manual verification reject error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
