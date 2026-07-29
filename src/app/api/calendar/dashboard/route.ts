import { withAuth } from "@/lib/api";
import {
  createCalendarDashboardService,
  serializeCalendarDashboard,
  type CalendarSyncDashboardStatus,
} from "@/server/calendar/dashboard";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set([
  "all",
  "pending",
  "synced",
  "failed",
  "deleted",
  "reconnect_required",
]);

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const requestedStatus = url.searchParams.get("status") ?? "all";
  const status = allowedStatuses.has(requestedStatus)
    ? (requestedStatus as CalendarSyncDashboardStatus | "all")
    : "all";
  const dashboard = await createCalendarDashboardService().getDashboard({
    organizationId: session.organizationId,
    status,
  });
  return Response.json(serializeCalendarDashboard(dashboard));
});
