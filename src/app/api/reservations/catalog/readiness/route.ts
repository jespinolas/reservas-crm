import { withAuth } from "@/lib/api";
import { createReservationCatalogService } from "@/server/reservations/catalog";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const readiness = await createReservationCatalogService().getCatalogReadiness(
    session.organizationId
  );
  return Response.json({ readiness });
});
