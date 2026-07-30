import type { BookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";
import type { BookingValueSummary } from "@/lib/booking-value-summary";

export type BookingReadinessPrintSummaryInput = {
  readinessStatus: BookingAutomationReadinessSummary["status"];
  demoTitle: string;
  valueSummary: Pick<BookingValueSummary, "headline" | "benefits">;
};

export type BookingReadinessPrintSummary = {
  badge: string;
  headline: string;
  statusLine: string;
  benefits: string[];
  authorityNote: string;
};

export function buildBookingReadinessPrintSummary(
  input: BookingReadinessPrintSummaryInput
): BookingReadinessPrintSummary {
  const common = {
    headline: input.valueSummary.headline,
    benefits: input.valueSummary.benefits.slice(0, 4),
    authorityNote:
      "La IA atiende y guía. El CRM controla disponibilidad, precios, señas, holds y confirmaciones.",
  };

  if (input.readinessStatus === "ready") {
    return {
      ...common,
      badge: "Auto-reservas listas",
      statusLine: `Estado comercial: listo para mostrar. Demo: ${input.demoTitle}.`,
    };
  }

  if (input.readinessStatus === "warning") {
    return {
      ...common,
      badge: "Auto-reservas en revisión",
      statusLine: `Estado comercial: mostrar con cuidado. Demo: ${input.demoTitle}.`,
    };
  }

  return {
    ...common,
    badge: "Setup requerido",
    statusLine: `Estado comercial: completar configuración antes de vender. Demo: ${input.demoTitle}.`,
  };
}
