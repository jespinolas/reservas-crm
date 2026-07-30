import { describe, expect, it } from "vitest";
import { buildBookingDemoScript } from "@/lib/booking-demo-script";

describe("buildBookingDemoScript", () => {
  it("returns live-ready-safe copy for ready demos", () => {
    const script = buildBookingDemoScript({ demoStatus: "ready" });

    expect(script).toMatchObject({
      badge: "Lista para demo",
      framing: "Mostrá el flujo como una reserva 24/7 lista para operar con revisión humana de pagos.",
    });
    expect(script.operatorNote).toContain("disponibilidad");
    expect(script.operatorNote).toContain("CRM");
  });

  it("returns cautionary copy for warning demos", () => {
    const script = buildBookingDemoScript({ demoStatus: "warning" });

    expect(script).toMatchObject({
      badge: "Demo con cuidado",
    });
    expect(script.expectedAssistantReply).toContain("configuración por cerrar");
    expect(script.operatorNote).toContain("No prometer operación en vivo");
  });

  it("returns sandbox-only copy for blocked demos", () => {
    const script = buildBookingDemoScript({ demoStatus: "blocked" });

    expect(script).toMatchObject({
      badge: "Solo sandbox",
    });
    expect(script.framing).toContain("No lo presentes como listo");
    expect(script.operatorNote).toContain("sin prometer disponibilidad real");
  });
});
