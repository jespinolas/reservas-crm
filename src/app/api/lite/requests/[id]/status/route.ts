import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createLiteBookingRequestService,
  liteBookingRequestStatusSchema,
  liteRequestErrorResponse,
  serializeLiteRequest,
} from "@/server/lite/requests";

export const dynamic = "force-dynamic";

const statusBodySchema = z.object({
  status: liteBookingRequestStatusSchema,
  operatorNote: z.string().trim().max(1000).nullable().optional(),
});

export const POST = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, statusBodySchema);
    if (!body.ok) return body.response;
    const params = await context.params;
    try {
      const request = await createLiteBookingRequestService().updateStatus({
        organizationId: session.organizationId,
        requestId: params.id,
        actorUserId: session.userId,
        status: body.data.status,
        operatorNote: body.data.operatorNote ?? null,
      });
      return Response.json({ request: serializeLiteRequest(request) });
    } catch (error) {
      try {
        return liteRequestErrorResponse(error);
      } catch (unhandled) {
        console.error("[lite] unhandled status update error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
