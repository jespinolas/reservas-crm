import { apiError, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export const POST = withAuth(async () => {
  const env = getEnv();
  if (!env.PLATFORM_INSTALLATION_ID) {
    return apiError(
      503,
      "instagram_connect_not_configured",
      "Esta instalación no tiene PLATFORM_INSTALLATION_ID configurado"
    );
  }

  const response = await fetch(
    `${env.PLATFORM_ORIGIN.replace(/\/$/, "")}/api/meta/instagram/start`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installationId: env.PLATFORM_INSTALLATION_ID }),
    }
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return Response.json(
      body ?? {
        ok: false,
        code: "platform_instagram_start_failed",
        message: "No se pudo iniciar la conexión con Instagram",
      },
      { status: response.status }
    );
  }

  return Response.json(body);
});
