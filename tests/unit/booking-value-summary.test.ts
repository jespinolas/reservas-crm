import { describe, expect, it } from "vitest";
import { buildBookingValueSummary } from "@/lib/booking-value-summary";

describe("buildBookingValueSummary", () => {
  it("returns sales-ready copy when readiness is ready", () => {
    const summary = buildBookingValueSummary({ readinessStatus: "ready" });

    expect(summary.headline).toBe("Vendé auto-reservas 24/7 con control del negocio");
    expect(summary.subheadline).toContain("CRM decide disponibilidad");
    expect(summary.caution).toContain("listo para operar");
  });

  it("returns cautious copy when readiness has warnings", () => {
    const summary = buildBookingValueSummary({ readinessStatus: "warning" });

    expect(summary.headline).toBe("El valor ya se puede mostrar, pero falta cerrar detalles");
    expect(summary.caution).toContain("No venderlo como activo");
  });

  it("returns setup-first copy when readiness is blocked", () => {
    const summary = buildBookingValueSummary({ readinessStatus: "blocked" });

    expect(summary.headline).toBe("Primero completá la base para vender auto-reservas");
    expect(summary.caution).toContain("solo como explicación conceptual");
  });

  it("always covers the core business benefits without moving authority to AI", () => {
    const summary = buildBookingValueSummary({ readinessStatus: "ready" });

    expect(summary.benefits).toHaveLength(4);
    expect(summary.benefits.join(" ")).toContain("24/7");
    expect(summary.benefits.join(" ")).toContain("pago revisado por el negocio");
    expect(summary.benefits.join(" ")).toContain("disponibilidad, precio y holds salen del CRM");
  });
});
