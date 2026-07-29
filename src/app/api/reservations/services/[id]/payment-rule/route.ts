import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createServicePaymentRuleService,
  serializeServicePaymentRule,
  servicePaymentRuleInputSchema,
  ServicePaymentRuleError,
} from "@/server/reservations/payment-rules";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (session, _req: Request, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    try {
      const rule = await createServicePaymentRuleService().getRule(
        session.organizationId,
        params.id
      );
      return Response.json({ paymentRule: serializeServicePaymentRule(rule) });
    } catch (error) {
      if (error instanceof ServicePaymentRuleError && error.code === "service_not_found") {
        return apiError(404, "service_not_found", "Servicio no encontrado");
      }
      throw error;
    }
  }
);

export const PUT = withAuth(
  async (session, req: Request, context: { params: Promise<{ id: string }> }) => {
    const body = await parseBody(req, servicePaymentRuleInputSchema);
    if (!body.ok) return body.response;
    const params = await context.params;

    try {
      const rule = await createServicePaymentRuleService().upsertRule({
        organizationId: session.organizationId,
        serviceId: params.id,
        rule: body.data,
      });
      return Response.json({ paymentRule: serializeServicePaymentRule(rule) });
    } catch (error) {
      if (error instanceof ServicePaymentRuleError) {
        if (error.code === "service_not_found") {
          return apiError(404, "service_not_found", "Servicio no encontrado");
        }
        return apiError(400, error.code, "Regla de pago inválida");
      }
      throw error;
    }
  }
);
