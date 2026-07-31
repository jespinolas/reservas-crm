import { z } from "zod";
import { apiError, withAuth } from "@/lib/api";
import {
  createLiteBookingRequestService,
  liteBookingRequestStatusSchema,
  serializeLiteRequest,
} from "@/server/lite/requests";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const parsedStatuses = z
    .array(liteBookingRequestStatusSchema)
    .safeParse(url.searchParams.getAll("status"));
  if (!parsedStatuses.success) return apiError(422, "invalid_status", "Estado inválido");
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const requests = await createLiteBookingRequestService().list({
    organizationId: session.organizationId,
    statuses: parsedStatuses.data.length ? parsedStatuses.data : undefined,
    limit,
  });
  return Response.json({ requests: requests.map(serializeLiteRequest) });
});
