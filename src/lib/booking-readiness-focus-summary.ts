import type { BookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";

export type BookingReadinessFocusSummaryInput = Pick<
  BookingAutomationReadinessSummary,
  "status" | "issues" | "demoChecklist"
>;

export type BookingReadinessFocusSummary = {
  tone: "ready" | "warning" | "blocked";
  title: string;
  message: string;
  actionLabel: string | null;
  actionHref: string | null;
};

export function buildBookingReadinessFocusSummary(
  input: BookingReadinessFocusSummaryInput
): BookingReadinessFocusSummary {
  const blockedIssue = input.issues.find((issue) => issue.severity === "blocked");
  if (blockedIssue) {
    return {
      tone: "blocked",
      title: `Próximo paso: ${blockedIssue.label}`,
      message: blockedIssue.message,
      actionLabel: blockedIssue.actionLabel,
      actionHref: blockedIssue.actionHref,
    };
  }

  const warningIssue = input.issues.find((issue) => issue.severity === "warning");
  if (warningIssue) {
    return {
      tone: "warning",
      title: `Próximo paso: ${warningIssue.label}`,
      message: warningIssue.message,
      actionLabel: warningIssue.actionLabel,
      actionHref: warningIssue.actionHref,
    };
  }

  if (input.demoChecklist.status !== "ready") {
    return {
      tone: input.demoChecklist.status,
      title: "Próximo paso: revisión de demo",
      message: input.demoChecklist.message,
      actionLabel: "Ver checklist",
      actionHref: "#booking-readiness",
    };
  }

  if (input.status === "ready") {
    return {
      tone: "ready",
      title: "Sin próximos pasos críticos",
      message: "La preparación visible está lista para operar y demostrar auto-reservas.",
      actionLabel: null,
      actionHref: null,
    };
  }

  return {
    tone: "warning",
    title: "Próximo paso: revisión admin",
    message: "La configuración no muestra bloqueos, pero todavía requiere revisión antes de venderla como activa.",
    actionLabel: "Revisar preparación",
    actionHref: "#booking-readiness",
  };
}
