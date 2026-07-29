import { withAuth } from "@/lib/api";
import { getAiProviderReadiness } from "@/lib/env";
import {
  AiBookingSessionService,
  DrizzleAiBookingSessionRepository,
} from "@/server/ai/booking-sessions";
import { createReservationCatalogService } from "@/server/reservations/catalog";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const [settings, catalogReadiness] = await Promise.all([
    new AiBookingSessionService(new DrizzleAiBookingSessionRepository()).getSettings(
      session.organizationId
    ),
    createReservationCatalogService().getCatalogReadiness(session.organizationId),
  ]);
  const aiProvider = getAiProviderReadiness();
  const checks = [
    {
      key: "booking_mode",
      ok: settings.mode !== "disabled",
      status: settings.mode === "disabled" ? "blocked" : "ok",
      message:
        settings.mode === "disabled"
          ? "Las reservas con IA están desactivadas"
          : "Modo de reservas con IA configurado",
    },
    {
      key: "catalog",
      ok: catalogReadiness.ready,
      status: catalogReadiness.ready ? "ok" : "blocked",
      message: catalogReadiness.ready
        ? "Catálogo listo"
        : "Faltan recursos o servicios activos",
    },
    {
      key: "ai_provider",
      ok: aiProvider.configured,
      status: aiProvider.configured ? "ok" : "blocked",
      message: aiProvider.configured
        ? "Proveedor de IA configurado"
        : "Proveedor de IA no configurado",
    },
  ];
  const ready = checks.every((check) => check.ok);
  return Response.json({
    readiness: {
      ready,
      liveBookingAllowed: ready && settings.readinessStatus === "ready",
      mode: settings.mode,
      storedReadinessStatus: settings.readinessStatus,
      checks,
      catalog: catalogReadiness,
      aiProvider,
    },
  });
});
