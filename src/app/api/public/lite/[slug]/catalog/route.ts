import { createLiteBookingRequestService, liteRequestErrorResponse } from "@/server/lite/requests";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const params = await context.params;
  try {
    const catalog = await createLiteBookingRequestService().getPublicCatalog(params.slug);
    return Response.json({
      business: catalog.business,
      resources: catalog.resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        description: resource.description,
        kind: resource.kind,
        location: resource.location,
        capacity: resource.capacity,
      })),
      services: catalog.services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceEstimate: service.priceEstimate,
        depositDue: service.depositDue,
      })),
      copy: {
        boundary: "Solicitud sujeta a confirmación.",
        noAutomation:
          "Este negocio confirma manualmente. No se creó una reserva automática.",
      },
    });
  } catch (error) {
    return liteRequestErrorResponse(error);
  }
}
