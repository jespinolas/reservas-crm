import { apiError, withAuth } from "@/lib/api";
import {
  createManualPaymentVerificationService,
  manualPaymentVerificationErrorResponse,
  serializeManualPaymentVerification,
} from "@/server/payments/manual-verifications";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    try {
      const verification = await createManualPaymentVerificationService().get(
        session.organizationId,
        params.id
      );
      return Response.json({
        verification: serializeManualPaymentVerification(verification),
      });
    } catch (error) {
      try {
        return manualPaymentVerificationErrorResponse(error);
      } catch (unhandled) {
        console.error("[payments] unhandled manual verification get error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
