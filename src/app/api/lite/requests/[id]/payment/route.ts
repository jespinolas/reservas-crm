import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createLiteBookingRequestService,
  liteRequestErrorResponse,
  serializeLiteRequest,
} from "@/server/lite/requests";

export const dynamic = "force-dynamic";

const paymentBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    expectedAmountMinor: z.coerce.number().int().min(1).nullable().optional(),
    currency: z.string().trim().length(3).nullable().optional(),
    instructions: z.string().trim().min(1).max(1200),
  }),
  z.object({
    action: z.literal("evidence"),
    evidenceRedacted: z.string().trim().min(1).max(1000),
  }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
]);

export const POST = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, paymentBodySchema);
    if (!body.ok) return body.response;
    const params = await context.params;
    const service = createLiteBookingRequestService();

    try {
      const request =
        body.data.action === "request"
          ? await service.requestPayment({
              organizationId: session.organizationId,
              requestId: params.id,
              actorUserId: session.userId,
              expectedAmountMinor: body.data.expectedAmountMinor ?? null,
              currency: body.data.currency ?? null,
              instructions: body.data.instructions,
            })
          : body.data.action === "evidence"
            ? await service.recordPaymentEvidence({
                organizationId: session.organizationId,
                requestId: params.id,
                actorUserId: session.userId,
                evidenceRedacted: body.data.evidenceRedacted,
              })
            : body.data.action === "approve"
              ? await service.approvePayment({
                  organizationId: session.organizationId,
                  requestId: params.id,
                  actorUserId: session.userId,
                })
              : await service.rejectPayment({
                  organizationId: session.organizationId,
                  requestId: params.id,
                  actorUserId: session.userId,
                });

      return Response.json({ request: serializeLiteRequest(request) });
    } catch (error) {
      try {
        return liteRequestErrorResponse(error);
      } catch (unhandled) {
        console.error("[lite] unhandled payment action error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
