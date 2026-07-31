import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  LiteOperatorError,
  LiteOperatorService,
  liteAvailabilityBlockStatusSchema,
  serializeAvailabilityBlock,
} from "@/server/lite/operator";

export const dynamic = "force-dynamic";

const blockBodySchema = z.object({
  resourceId: z.string().trim().min(1),
  status: liteAvailabilityBlockStatusSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  label: z.string().trim().max(160).nullable().optional(),
  operatorNote: z.string().trim().max(1000).nullable().optional(),
});

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const from = z.coerce.date().safeParse(url.searchParams.get("from") ?? new Date());
  const to = z.coerce.date().safeParse(
    url.searchParams.get("to") ?? new Date(Date.now() + 7 * 24 * 60 * 60_000)
  );
  if (!from.success || !to.success) return apiError(422, "invalid_range", "Rango inválido");
  const blocks = await new LiteOperatorService().listAvailabilityBlocks({
    organizationId: session.organizationId,
    from: from.data,
    to: to.data,
  });
  return Response.json({ blocks: blocks.map(serializeAvailabilityBlock) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, blockBodySchema);
  if (!body.ok) return body.response;
  try {
    const block = await new LiteOperatorService().createAvailabilityBlock({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      ...body.data,
    });
    return Response.json({ block: serializeAvailabilityBlock(block) }, { status: 201 });
  } catch (error) {
    if (error instanceof LiteOperatorError) {
      return apiError(
        error.code === "resource_not_found" ? 404 : 422,
        error.code,
        error.code === "resource_not_found" ? "Recurso no encontrado" : "Rango inválido"
      );
    }
    throw error;
  }
});
