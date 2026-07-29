import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createManualPaymentVerificationService,
  manualPaymentVerificationErrorResponse,
  serializeManualPaymentVerification,
} from "@/server/payments/manual-verifications";

export const dynamic = "force-dynamic";

const cancelBodySchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
});

export const POST = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, cancelBodySchema);
    if (!body.ok) return body.response;
    const params = await context.params;

    try {
      const verification = await createManualPaymentVerificationService().cancel({
        organizationId: session.organizationId,
        id: params.id,
        actorUserId: session.userId,
        note: body.data.note ?? null,
      });
      return Response.json({ verification: serializeManualPaymentVerification(verification) });
    } catch (error) {
      try {
        return manualPaymentVerificationErrorResponse(error);
      } catch (unhandled) {
        console.error("[payments] unhandled manual verification cancel error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
