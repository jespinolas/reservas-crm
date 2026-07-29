import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { exportAiReplyEvidence, getAiReplyTrace } from "@/server/ai/trace";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  conversationId: z.string().min(1),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, exportSchema);
  if (!body.ok) return body.response;

  const trace = await getAiReplyTrace({
    organizationId: session.organizationId,
    conversationId: body.data.conversationId,
    since: body.data.since ? new Date(body.data.since) : undefined,
    until: body.data.until ? new Date(body.data.until) : undefined,
  });
  if (!trace) return apiError(404, "not_found", "Conversación no encontrada");

  return Response.json({ evidence: exportAiReplyEvidence({ trace }) });
});
