import { apiError, withAuth } from "@/lib/api";
import {
  AiBookingSessionService,
  DrizzleAiBookingSessionRepository,
  type AiBookingSession,
} from "@/server/ai/booking-sessions";
import {
  createManualPaymentVerificationService,
  serializeManualPaymentVerification,
} from "@/server/payments/manual-verifications";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const bookingSession = await createService().getSessionByConversation({
    organizationId: session.organizationId,
    conversationId: id,
  });
  const paymentVerification = bookingSession?.manualPaymentVerificationId
    ? await createManualPaymentVerificationService()
        .get(session.organizationId, bookingSession.manualPaymentVerificationId)
        .then(serializeManualPaymentVerification)
        .catch(() => null)
    : null;
  return Response.json({
    bookingSession: bookingSession ? serializeSession(bookingSession) : null,
    paymentVerification,
  });
});

export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const service = createService();
  const bookingSession = await service.getSessionByConversation({
    organizationId: session.organizationId,
    conversationId: id,
  });
  if (!bookingSession) return apiError(404, "not_found", "Sesión de reserva no encontrada");

  const escalated = await service.transition({
    session: bookingSession,
    toStatus: "escalated",
    actorType: "operator",
    actorId: session.userId,
    eventType: "ai_booking.escalated",
  });
  return Response.json({ bookingSession: serializeSession(escalated) });
});

function createService() {
  return new AiBookingSessionService(new DrizzleAiBookingSessionRepository());
}

function serializeSession(session: AiBookingSession) {
  return {
    id: session.id,
    conversationId: session.conversationId,
    contactId: session.contactId,
    status: session.status,
    serviceId: session.serviceId,
    resourceId: session.resourceId,
    requestedStartsAt: session.requestedStartsAt?.toISOString() ?? null,
    requestedEndsAt: session.requestedEndsAt?.toISOString() ?? null,
    partySize: session.partySize,
    selectedOptionJsonRedacted: session.selectedOptionJsonRedacted,
    bookingHoldId: session.bookingHoldId,
    manualPaymentVerificationId: session.manualPaymentVerificationId,
    reservationId: session.reservationId,
    expiresAt: session.expiresAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
