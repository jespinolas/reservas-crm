import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { buildLiteHandoffTemplate } from "@/server/lite/whatsapp-handoff";
import {
  createLiteBookingRequestService,
  liteRequestErrorResponse,
} from "@/server/lite/requests";
import { calculateServicePaymentQuote } from "@/server/reservations/payment-rules";

export const dynamic = "force-dynamic";

const kindSchema = z.enum([
  "request_received",
  "availability_follow_up",
  "payment_request",
  "confirmation",
  "decline",
  "reschedule",
  "reminder",
]);

export const GET = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    const url = new URL(req.url);
    const kind = kindSchema.safeParse(url.searchParams.get("kind") ?? "request_received");
    if (!kind.success) return apiError(422, "invalid_template_kind", "Plantilla inválida");
    try {
      const request = await createLiteBookingRequestService().get(
        session.organizationId,
        params.id
      );
      const db = getDb();
      const [org] = await db
        .select({ name: schema.organization.name })
        .from(schema.organization)
        .where(eq(schema.organization.id, session.organizationId))
        .limit(1);
      const [service] = await db
        .select()
        .from(schema.reservationService)
        .where(
          and(
            eq(schema.reservationService.organizationId, session.organizationId),
            eq(schema.reservationService.id, request.serviceId)
          )
        )
        .limit(1);
      const [resource] = request.resourceId
        ? await db
            .select()
            .from(schema.resource)
            .where(
              and(
                eq(schema.resource.organizationId, session.organizationId),
                eq(schema.resource.id, request.resourceId)
              )
            )
            .limit(1)
        : [null];
      const [rule] = await db
        .select()
        .from(schema.reservationServicePaymentRule)
        .where(
          and(
            eq(schema.reservationServicePaymentRule.organizationId, session.organizationId),
            eq(schema.reservationServicePaymentRule.serviceId, request.serviceId)
          )
        )
        .limit(1);
      if (!service) return apiError(404, "service_not_found", "Servicio no encontrado");
      const quote = calculateServicePaymentQuote(
        rule ? { ...rule, depositType: rule.depositType as "none" | "fixed" | "percentage" | "full" } : null
      );
      const template = buildLiteHandoffTemplate({
        kind: kind.data,
        businessName: org?.name ?? "Reservas",
        customerName: request.customerName,
        customerPhone: request.customerPhone,
        serviceName: service.name,
        resourceName: resource?.name ?? null,
        startsAt: request.startsAt,
        endsAt: request.endsAt,
        partySize: request.partySize,
        priceDisplay: quote.priceEstimate?.display ?? null,
        depositDisplay:
          request.paymentExpectedAmountMinor != null
            ? new Intl.NumberFormat("es-PY", {
                style: "currency",
                currency: request.paymentCurrency,
                maximumFractionDigits: request.paymentCurrency === "PYG" ? 0 : 2,
              }).format(request.paymentExpectedAmountMinor)
            : quote.depositDue?.display ?? null,
        paymentInstructions: request.paymentInstructions,
      });
      return Response.json({ template });
    } catch (error) {
      try {
        return liteRequestErrorResponse(error);
      } catch (unhandled) {
        console.error("[lite] unhandled handoff error:", unhandled);
        return apiError(500, "internal", "Error interno");
      }
    }
  }
);
