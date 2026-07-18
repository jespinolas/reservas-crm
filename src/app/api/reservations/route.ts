import { withAuth } from "@/lib/api";
import {
  createReservationListService,
  serializeReservationListItem,
} from "@/server/reservations/list";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const result = await createReservationListService().listDashboard({
    organizationId: session.organizationId,
  });
  return Response.json({
    reservations: result.items.map(serializeReservationListItem),
    summary: result.summary,
  });
});
