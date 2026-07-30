import { describe, expect, it } from "vitest";
import { buildBookingReadinessPrintSummary } from "@/lib/booking-readiness-print-summary";

const valueSummary = {
  headline: "Vendé auto-reservas 24/7 con control del negocio",
  benefits: [
    "Captura consultas de reserva 24/7.",
    "Reduce mensajes repetitivos.",
    "Mantiene confirmación detrás de pago revisado.",
    "Evita doble reserva porque el CRM decide.",
  ],
};

describe("buildBookingReadinessPrintSummary", () => {
  it("builds a sales-ready public-safe print summary", () => {
    const summary = buildBookingReadinessPrintSummary({
      readinessStatus: "ready",
      demoTitle: "Demo lista",
      valueSummary,
    });

    expect(summary).toMatchObject({
      badge: "Auto-reservas listas",
      headline: valueSummary.headline,
      statusLine: "Estado comercial: listo para mostrar. Demo: Demo lista.",
    });
    expect(summary.authorityNote).toContain("El CRM controla disponibilidad");
  });

  it("builds a cautious public-safe print summary for warning status", () => {
    const summary = buildBookingReadinessPrintSummary({
      readinessStatus: "warning",
      demoTitle: "Demo con advertencias",
      valueSummary,
    });

    expect(summary).toMatchObject({
      badge: "Auto-reservas en revisión",
      statusLine: "Estado comercial: mostrar con cuidado. Demo: Demo con advertencias.",
    });
    expect(summary.benefits).toHaveLength(4);
  });

  it("builds a setup-first public-safe print summary for blocked status", () => {
    const summary = buildBookingReadinessPrintSummary({
      readinessStatus: "blocked",
      demoTitle: "Demo no lista",
      valueSummary,
    });

    expect(summary).toMatchObject({
      badge: "Setup requerido",
      statusLine: "Estado comercial: completar configuración antes de vender. Demo: Demo no lista.",
    });
    expect(JSON.stringify(summary)).not.toContain("calendar");
    expect(JSON.stringify(summary)).not.toContain("payment_reference");
  });
});
