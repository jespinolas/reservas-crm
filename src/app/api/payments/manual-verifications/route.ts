import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createManualPaymentVerificationService,
  manualPaymentVerificationErrorResponse,
  manualPaymentVerificationStatusSchema,
  serializeManualPaymentVerification,
} from "@/server/payments/manual-verifications";

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  holdId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).nullable().optional(),
  expectedAmountMinor: z.coerce.number().int().min(1),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  evidence: z
    .object({
      evidenceMessageId: z.string().trim().min(1).nullable().optional(),
      evidenceMediaId: z.string().trim().min(1).nullable().optional(),
      evidenceStorageRef: z.string().trim().min(1).nullable().optional(),
      customerReferenceRedacted: z.string().trim().max(500).nullable().optional(),
    })
    .optional(),
  expiresAt: z.coerce.date().optional(),
});

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const parsedStatuses = z
    .array(manualPaymentVerificationStatusSchema)
    .safeParse(url.searchParams.getAll("status"));
  if (!parsedStatuses.success) {
    return apiError(422, "invalid_status", "Estado inválido");
  }
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const conversationId = url.searchParams.get("conversationId");
  const verifications = await createManualPaymentVerificationService().list({
    organizationId: session.organizationId,
    conversationId,
    statuses: parsedStatuses.data.length ? parsedStatuses.data : undefined,
    limit,
  });
  return Response.json({
    verifications: verifications.map(serializeManualPaymentVerification),
  });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createBodySchema);
  if (!body.ok) return body.response;

  try {
    const verification = await createManualPaymentVerificationService().createReviewRequest({
      organizationId: session.organizationId,
      ...body.data,
    });
    return Response.json(
      { verification: serializeManualPaymentVerification(verification) },
      { status: 201 }
    );
  } catch (error) {
    try {
      return manualPaymentVerificationErrorResponse(error);
    } catch (unhandled) {
      console.error("[payments] unhandled manual verification create error:", unhandled);
      return apiError(500, "internal", "Error interno");
    }
  }
});
