import { apiError, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export const POST = withAuth(async () => {
  const env = getEnv();
  if (!env.CRM_PROVISIONING_SECRET || !env.PLATFORM_INSTALLATION_ID) {
    return apiError(
      503,
      "disconnect_not_configured",
      "La desconexión de WhatsApp no está configurada para esta instalación"
    );
  }

  const response = await fetch(
    `${env.PLATFORM_ORIGIN.replace(/\/$/, "")}/api/installer/whatsapp/disconnect`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reservas-operator-secret": env.CRM_PROVISIONING_SECRET,
      },
      body: JSON.stringify({
        installationId: env.PLATFORM_INSTALLATION_ID,
        confirm: "disconnect-whatsapp",
      }),
    }
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return Response.json(
      body ?? {
        ok: false,
        code: "platform_disconnect_failed",
        message: "No se pudo desconectar WhatsApp en la plataforma",
      },
      { status: response.status }
    );
  }

  return Response.json(body);
});
