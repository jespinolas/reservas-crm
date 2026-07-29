import { apiError, withAuth } from "@/lib/api";
import {
  createReservationAnalyticsService,
  ReservationAnalyticsError,
} from "@/server/analytics/reservations";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  try {
    const dashboard = await createReservationAnalyticsService().getDashboard({
      organizationId: session.organizationId,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    return Response.json(dashboard);
  } catch (error) {
    if (error instanceof ReservationAnalyticsError) {
      return apiError(422, error.code, error.message);
    }
    throw error;
  }
});
