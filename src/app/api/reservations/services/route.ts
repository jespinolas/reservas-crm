import { withAuth } from "@/lib/api";
import { createReservationApiService } from "@/server/reservations/api";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const catalog = await createReservationApiService().listActiveCatalog({
    organizationId: session.organizationId,
  });
  return Response.json({ services: catalog.services });
});
