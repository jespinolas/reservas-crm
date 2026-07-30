import { describe, expect, it } from "vitest";
import { buildBookingReadinessFocusSummary } from "@/lib/booking-readiness-focus-summary";
import type { BookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";

const readyDemoChecklist: BookingAutomationReadinessSummary["demoChecklist"] = {
  status: "ready",
  title: "Demo lista",
  message: "Todo listo.",
  items: [],
};

describe("buildBookingReadinessFocusSummary", () => {
  it("prioritizes the first blocked issue before warnings", () => {
    const summary = buildBookingReadinessFocusSummary({
      status: "blocked",
      demoChecklist: readyDemoChecklist,
      issues: [
        issue("pending_work", "Trabajo pendiente", "warning"),
        issue("catalog", "Catálogo", "blocked"),
      ],
    });

    expect(summary).toEqual({
      tone: "blocked",
      title: "Próximo paso: Catálogo",
      message: "Catálogo requiere atención.",
      actionLabel: "Revisar Catálogo",
      actionHref: "#catalog",
    });
  });

  it("uses the first warning issue when no blocker exists", () => {
    const summary = buildBookingReadinessFocusSummary({
      status: "warning",
      demoChecklist: readyDemoChecklist,
      issues: [issue("payment_rules", "Reglas de pago", "warning")],
    });

    expect(summary).toMatchObject({
      tone: "warning",
      title: "Próximo paso: Reglas de pago",
      actionHref: "#payment-rules",
    });
  });

  it("uses demo checklist warning when there are no issues", () => {
    const summary = buildBookingReadinessFocusSummary({
      status: "warning",
      demoChecklist: {
        ...readyDemoChecklist,
        status: "warning",
        title: "Demo con advertencias",
        message: "Falta revisión admin.",
      },
      issues: [],
    });

    expect(summary).toEqual({
      tone: "warning",
      title: "Próximo paso: revisión de demo",
      message: "Falta revisión admin.",
      actionLabel: "Ver checklist",
      actionHref: "#booking-readiness",
    });
  });

  it("returns all-clear copy when ready and no issues remain", () => {
    const summary = buildBookingReadinessFocusSummary({
      status: "ready",
      demoChecklist: readyDemoChecklist,
      issues: [],
    });

    expect(summary).toEqual({
      tone: "ready",
      title: "Sin próximos pasos críticos",
      message: "La preparación visible está lista para operar y demostrar auto-reservas.",
      actionLabel: null,
      actionHref: null,
    });
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
    actionLabel: `Revisar ${label}`,
    actionHref: `#${key.replace("_", "-")}`,
  };
}
