import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  AiBookingSessionService,
  DrizzleAiBookingSessionRepository,
  aiBookingModeSchema,
  aiBookingReadinessStatusSchema,
  type AiBookingSettings,
} from "@/server/ai/booking-sessions";

export const dynamic = "force-dynamic";

const putSchema = z
  .object({
    mode: aiBookingModeSchema,
    readinessStatus: aiBookingReadinessStatusSchema.optional(),
  })
  .strict();

export const GET = withAuth(async (session) => {
  const settings = await createService().getSettings(session.organizationId);
  return Response.json({ settings: serializeSettings(settings) });
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!canManageBookingSettings(session.role)) {
    return apiError(403, "forbidden", "No puedes cambiar la configuración de reservas con IA");
  }

  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const settings = await createService().saveSettings({
    organizationId: session.organizationId,
    mode: body.data.mode,
    enabledByUserId: session.userId,
    readinessStatus: body.data.readinessStatus,
    readinessLastCheckedAt: body.data.readinessStatus ? new Date() : undefined,
  });
  return Response.json({ settings: serializeSettings(settings) });
});

function createService() {
  return new AiBookingSessionService(new DrizzleAiBookingSessionRepository());
}

function canManageBookingSettings(role: string): boolean {
  return role === "owner" || role === "admin";
}

function serializeSettings(settings: AiBookingSettings) {
  return {
    id: settings.id,
    mode: settings.mode,
    enabledByUserId: settings.enabledByUserId,
    enabledAt: settings.enabledAt?.toISOString() ?? null,
    readinessLastCheckedAt: settings.readinessLastCheckedAt?.toISOString() ?? null,
    readinessStatus: settings.readinessStatus,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}
