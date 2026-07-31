import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import {
  LiteOperatorService,
  liteReliabilitySchema,
  serializeCustomerProfileSummary,
} from "@/server/lite/operator";

export const dynamic = "force-dynamic";

const profileBodySchema = z.object({
  reliability: liteReliabilitySchema,
  operatorNote: z.string().trim().max(1000).nullable().optional(),
});

export const GET = withAuth(
  async (session, _req: Request, context: { params: Promise<{ phone: string }> }) => {
    const params = await context.params;
    const summary = await new LiteOperatorService().getCustomerProfile({
      organizationId: session.organizationId,
      phone: decodeURIComponent(params.phone),
    });
    return Response.json({ customer: serializeCustomerProfileSummary(summary) });
  }
);

export const PUT = withAuth(
  async (session, req: Request, context: { params: Promise<{ phone: string }> }) => {
    const body = await parseBody(req, profileBodySchema);
    if (!body.ok) return body.response;
    const params = await context.params;
    const service = new LiteOperatorService();
    await service.upsertCustomerProfile({
      organizationId: session.organizationId,
      phone: decodeURIComponent(params.phone),
      actorUserId: session.userId,
      ...body.data,
    });
    const summary = await service.getCustomerProfile({
      organizationId: session.organizationId,
      phone: decodeURIComponent(params.phone),
    });
    return Response.json({ customer: serializeCustomerProfileSummary(summary) });
  }
);
