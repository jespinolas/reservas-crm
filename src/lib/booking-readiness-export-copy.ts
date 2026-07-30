import type { BookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";
import type { BookingValueSummary } from "@/lib/booking-value-summary";

export type BookingReadinessExportCopyInput = {
  readiness: Pick<BookingAutomationReadinessSummary, "status" | "title" | "issues" | "demoChecklist">;
  valueSummary: Pick<BookingValueSummary, "headline">;
};

const MAX_ISSUES = 3;

export function buildBookingReadinessExportCopy(
  input: BookingReadinessExportCopyInput
): string {
  const readinessLabel = readinessStatusLabel(input.readiness.status);
  const demoLabel = input.readiness.demoChecklist.title;
  const issueLines =
    input.readiness.issues.length === 0
      ? ["- Sin bloqueos ni advertencias operativas visibles."]
      : input.readiness.issues.slice(0, MAX_ISSUES).map((issue) => {
          const prefix = issue.severity === "blocked" ? "Bloqueo" : "Revisar";
          return `- ${prefix}: ${issue.label} — ${issue.message}`;
        });
  const remainingIssues = input.readiness.issues.length - MAX_ISSUES;
  const cappedIssueLines =
    remainingIssues > 0
      ? [...issueLines, `- ${remainingIssues} punto(s) adicional(es) quedan en el CRM.`]
      : issueLines;

  return [
    "Resumen de auto-reservas",
    `Estado: ${readinessLabel} (${input.readiness.title}).`,
    `Demo: ${demoLabel}.`,
    `Valor: ${input.valueSummary.headline}.`,
    "Puntos actuales:",
    ...cappedIssueLines,
    "Nota de seguridad: la IA solo conversa y guía; disponibilidad, precio, seña, holds y confirmación los decide el CRM.",
  ].join("\n");
}

function readinessStatusLabel(status: BookingAutomationReadinessSummary["status"]): string {
  if (status === "ready") return "Lista";
  if (status === "warning") return "Revisar";
  return "Bloqueada";
}
