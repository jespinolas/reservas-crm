import { randomUUID } from "node:crypto";
import { apiError, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { disconnectInstagramByOrg } from "@/server/instagram/credentials";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (session) => {
  const env = getEnv();
  if (!env.CRM_PROVISIONING_SECRET || !env.PLATFORM_INSTALLATION_ID) {
    return apiError(
      503,
      "disconnect_not_configured",
      "La desconexión de Instagram no está configurada para esta instalación"
    );
  }

  const response = await fetch(
    `${env.PLATFORM_ORIGIN.replace(/\/$/, "")}/api/meta/instagram/disconnect`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reservas-operator-secret": env.CRM_PROVISIONING_SECRET,
      },
      body: JSON.stringify({
        installationId: env.PLATFORM_INSTALLATION_ID,
        requestedBy: session.userId,
        idempotencyKey: randomUUID(),
      }),
    }
  );
  const body = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        connectionStatus?: string;
        metaRevocationStatus?: string;
        code?: string;
        message?: string;
      }
    | null;
  if (!response.ok || body?.ok !== true) {
    return Response.json(
      body ?? {
        ok: false,
        code: "platform_instagram_disconnect_failed",
        message: "No se pudo desconectar Instagram en la plataforma",
      },
      { status: response.status }
    );
  }

  const disconnectedLocalConnections = await disconnectInstagramByOrg(session.organizationId);

  return Response.json({
    ok: true,
    status: "disconnected",
    metaRevocationStatus: body.metaRevocationStatus ?? "not_attempted",
    disconnectedLocalConnections,
    message: "Instagram fue desconectado.",
  });
});

