import { describe, expect, it } from "vitest";
import { buildBookingReadinessExportCopy } from "@/lib/booking-readiness-export-copy";
import type { BookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";

const baseDemoChecklist: BookingAutomationReadinessSummary["demoChecklist"] = {
  status: "ready",
  title: "Demo lista",
  message: "El setup está en condiciones para mostrar el flujo.",
  items: [],
};

describe("buildBookingReadinessExportCopy", () => {
  it("builds ready export copy without blockers", () => {
    const copy = buildBookingReadinessExportCopy({
      readiness: {
        status: "ready",
        title: "Auto-reservas listas",
        demoChecklist: baseDemoChecklist,
        issues: [],
      },
      valueSummary: {
        headline: "Vendé auto-reservas 24/7 con control del negocio",
      },
    });

    expect(copy).toContain("Estado: Lista (Auto-reservas listas).");
    expect(copy).toContain("- Sin bloqueos ni advertencias operativas visibles.");
    expect(copy).toContain("la IA solo conversa y guía");
    expect(copy).toContain("los decide el CRM");
  });

  it("builds warning export copy with capped issue summary", () => {
    const copy = buildBookingReadinessExportCopy({
      readiness: {
        status: "warning",
        title: "Auto-reservas casi listas",
        demoChecklist: { ...baseDemoChecklist, status: "warning", title: "Demo con advertencias" },
        issues: [
          issue("payment_rules", "Reglas de pago", "warning"),
          issue("calendar_mapping", "Calendarios", "warning"),
          issue("pending_work", "Trabajo pendiente", "warning"),
          issue("admin_signoff", "Revisión admin", "warning"),
        ],
      },
      valueSummary: {
        headline: "El valor ya se puede mostrar, pero falta cerrar detalles",
      },
    });

    expect(copy).toContain("Estado: Revisar (Auto-reservas casi listas).");
    expect(copy).toContain("Demo: Demo con advertencias.");
    expect(copy.match(/Revisar:/g)).toHaveLength(3);
    expect(copy).toContain("1 punto(s) adicional(es) quedan en el CRM.");
  });

  it("builds blocked export copy that says setup must be completed first", () => {
    const copy = buildBookingReadinessExportCopy({
      readiness: {
        status: "blocked",
        title: "Auto-reservas no listas",
        demoChecklist: { ...baseDemoChecklist, status: "blocked", title: "Demo no lista" },
        issues: [issue("catalog", "Catálogo", "blocked")],
      },
      valueSummary: {
        headline: "Primero completá la base para vender auto-reservas",
      },
    });

    expect(copy).toContain("Estado: Bloqueada (Auto-reservas no listas).");
    expect(copy).toContain("Bloqueo: Catálogo");
    expect(copy).toContain("Primero completá la base para vender auto-reservas");
  });
});

function issue(
  key: string,
  label: string,
  severity: "blocked" | "warning"
): BookingAutomationReadinessSummary["issues"][number] {
  return {
    key,
    label,
    severity,
    message: `${label} requiere atención.`,
    actionLabel: "Revisar",
    actionHref: "#booking-readiness",
  };
}
