import { getLiteTierSalesCopy, getPlanEntitlements } from "@/server/lite/entitlements";

export const dynamic = "force-dynamic";

export default function LiteUpgradePage() {
  const lite = getPlanEntitlements("lite");
  const automation = getPlanEntitlements("automation");
  const copy = getLiteTierSalesCopy();

  const checks = [
    {
      title: "Meta Business account",
      lite: false,
      automation: automation.whatsappApi,
      detail: "Necesario para WhatsApp Cloud API y mensajes automáticos.",
    },
    {
      title: "WhatsApp Business API",
      lite: lite.whatsappApi,
      automation: automation.whatsappApi,
      detail: "Lite usa links wa.me y envío manual desde WhatsApp personal.",
    },
    {
      title: "AI replies",
      lite: lite.aiReplies,
      automation: automation.aiReplies,
      detail: "La AI entra solo cuando el negocio sube al plan de automatización.",
    },
    {
      title: "Auto-hold",
      lite: lite.autoHold,
      automation: automation.autoHold,
      detail: "Lite nunca bloquea disponibilidad automáticamente desde una solicitud pública.",
    },
    {
      title: "Payment automation",
      lite: lite.paymentProcessor,
      automation: automation.paymentProcessor,
      detail: "Lite registra seña y comprobantes de forma manual.",
    },
    {
      title: "Google Calendar OAuth",
      lite: lite.googleCalendarOAuth,
      automation: automation.googleCalendarOAuth,
      detail: "Lite exporta .ics sin pedir OAuth de Google.",
    },
  ];

  return (
    <main className="h-full overflow-auto p-6">
      <section className="rounded-lg border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Camino de upgrade
        </p>
        <h2 className="mt-2 text-2xl font-semibold">{copy.title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-text-3">{copy.promise}</p>
      </section>

      <section className="mt-5 rounded-lg border bg-card">
        <div className="border-b p-4">
          <h3 className="font-semibold">Qué tenés ahora vs qué desbloquea Automation</h3>
          <p className="mt-1 text-xs text-text-3">
            Tus recursos, servicios, precios, solicitudes, pagos manuales y reservas confirmadas
            quedan en el CRM. El upgrade no necesita empezar de cero.
          </p>
        </div>
        <div className="divide-y">
          {checks.map((check) => (
            <div key={check.title} className="grid gap-3 p-4 md:grid-cols-[1.2fr_0.6fr_0.6fr_2fr]">
              <div className="font-medium">{check.title}</div>
              <div className="text-sm">{check.lite ? "Incluido" : "No incluido"}</div>
              <div className="text-sm">{check.automation ? "Incluido" : "No incluido"}</div>
              <div className="text-sm text-text-3">{check.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-lg border bg-subtle p-5">
        <h3 className="font-semibold">Límite de seguridad</h3>
        <p className="mt-1 text-sm text-text-3">
          Ver esta pantalla no activa Meta, AI, Bancard, Google OAuth ni envíos automáticos. Es
          solo una checklist de preparación comercial y técnica.
        </p>
      </section>
    </main>
  );
}
