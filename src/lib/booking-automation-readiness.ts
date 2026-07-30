export type BookingAutomationReadinessInput = {
  aiBooking: {
    ready: boolean;
    liveBookingAllowed: boolean;
    mode: "disabled" | "suggest_only" | "auto_hold" | "manual_payment_confirm";
    checks: Array<{ key: string; ok: boolean; message: string }>;
  } | null;
  pendingWork: {
    total: number;
    urgent: number;
    expired: number;
    stale: number;
  };
  paymentRules?: {
    totalActiveServices: number;
    configuredServices: number;
    missingServiceNames: string[];
    ready: boolean;
  } | null;
  calendarMappings?: {
    totalActiveResources: number;
    connectedResources: number;
    missingResourceNames: string[];
    unhealthyResourceNames: string[];
    ready: boolean;
  } | null;
};

export type BookingAutomationReadinessSummary = {
  status: "ready" | "warning" | "blocked";
  title: string;
  message: string;
  issues: Array<{
    key: string;
    label: string;
    severity: "blocked" | "warning";
    message: string;
    actionLabel: string;
    actionHref: string;
  }>;
  checks: Array<{
    key: string;
    label: string;
    status: "ok" | "warning" | "blocked" | "info";
    message: string;
  }>;
};

export function buildBookingAutomationReadinessSummary(
  input: BookingAutomationReadinessInput
): BookingAutomationReadinessSummary {
  const bookingReady = input.aiBooking?.ready ?? false;
  const liveAllowed = input.aiBooking?.liveBookingAllowed ?? false;
  const hasOperationalWarning =
    input.pendingWork.expired > 0 || input.pendingWork.urgent > 0 || input.pendingWork.stale > 0;

  const checks: BookingAutomationReadinessSummary["checks"] = [
    bookingModeCheck(input.aiBooking),
    catalogCheck(input.aiBooking),
    aiProviderCheck(input.aiBooking),
    pendingWorkCheck(input.pendingWork),
    paymentRulesCheck(input.paymentRules ?? null),
    calendarMappingsCheck(input.calendarMappings ?? null),
  ];
  const issues = buildReadinessIssues(checks);

  if (!bookingReady) {
    return {
      status: "blocked",
      title: "Auto-reservas no listas",
      message: "Falta completar requisitos básicos antes de vender reservas 24/7.",
      issues,
      checks,
    };
  }

  if (
    !liveAllowed ||
    hasOperationalWarning ||
    input.paymentRules?.ready === false ||
    input.calendarMappings?.ready === false
  ) {
    return {
      status: "warning",
      title: "Auto-reservas casi listas",
      message:
        input.paymentRules?.ready === false
          ? "La configuración base está lista, pero faltan reglas de pago en servicios activos."
          : input.calendarMappings?.ready === false
            ? "La configuración base está lista, pero faltan calendarios o hay sync fallida."
          : hasOperationalWarning
            ? "La configuración base está lista, pero hay trabajo operativo pendiente."
            : "La configuración base está lista, pero falta marcarla como lista para vivo.",
      issues,
      checks,
    };
  }

  return {
    status: "ready",
    title: "Auto-reservas listas",
    message: "El negocio tiene la base mínima para operar reservas asistidas por IA.",
    issues,
    checks,
  };
}

function buildReadinessIssues(checks: BookingAutomationReadinessSummary["checks"]) {
  return checks
    .filter((check) => check.status === "blocked" || check.status === "warning")
    .sort((left, right) => issueSeverityRank(left.status) - issueSeverityRank(right.status))
    .map((check) => ({
      key: check.key,
      label: check.label,
      severity: check.status as "blocked" | "warning",
      message: check.message,
      ...issueAction(check.key),
    }));
}

function issueSeverityRank(status: BookingAutomationReadinessSummary["checks"][number]["status"]) {
  if (status === "blocked") return 0;
  if (status === "warning") return 1;
  return 2;
}

function issueAction(key: string): { actionLabel: string; actionHref: string } {
  switch (key) {
    case "booking_mode":
    case "ai_provider":
      return { actionLabel: "Abrir configuración IA", actionHref: "/agent" };
    case "catalog":
      return { actionLabel: "Abrir catálogo", actionHref: "#booking-catalog" };
    case "pending_work":
      return { actionLabel: "Ver pendientes", actionHref: "#booking-payment-reviews" };
    case "payment_rules":
      return { actionLabel: "Configurar pagos", actionHref: "#booking-payment-rules" };
    case "calendar_mapping":
      return { actionLabel: "Revisar calendarios", actionHref: "#booking-catalog" };
    default:
      return { actionLabel: "Revisar configuración", actionHref: "#booking-readiness" };
  }
}

function bookingModeCheck(input: BookingAutomationReadinessInput["aiBooking"]) {
  const mode = input?.mode ?? "disabled";
  const ok = mode !== "disabled";
  return {
    key: "booking_mode",
    label: "Modo IA",
    status: ok ? ("ok" as const) : ("blocked" as const),
    message: ok ? bookingModeLabel(mode) : "Las reservas con IA están desactivadas.",
  };
}

function catalogCheck(input: BookingAutomationReadinessInput["aiBooking"]) {
  const check = input?.checks.find((item) => item.key === "catalog");
  return {
    key: "catalog",
    label: "Catálogo",
    status: check?.ok ? ("ok" as const) : ("blocked" as const),
    message: check?.message ?? "No se pudo confirmar el estado del catálogo.",
  };
}

function aiProviderCheck(input: BookingAutomationReadinessInput["aiBooking"]) {
  const check = input?.checks.find((item) => item.key === "ai_provider");
  return {
    key: "ai_provider",
    label: "Proveedor IA",
    status: check?.ok ? ("ok" as const) : ("blocked" as const),
    message: check?.message ?? "No se pudo confirmar el proveedor de IA.",
  };
}

function pendingWorkCheck(input: BookingAutomationReadinessInput["pendingWork"]) {
  if (input.expired > 0) {
    return {
      key: "pending_work",
      label: "Trabajo pendiente",
      status: "warning" as const,
      message: `${input.expired} pendiente(s) vencido(s) requieren revisión.`,
    };
  }
  if (input.urgent > 0 || input.stale > 0) {
    return {
      key: "pending_work",
      label: "Trabajo pendiente",
      status: "warning" as const,
      message: `${input.urgent + input.stale} pendiente(s) urgentes o sin atender.`,
    };
  }
  return {
    key: "pending_work",
    label: "Trabajo pendiente",
    status: "ok" as const,
    message: input.total === 0 ? "Sin pendientes operativos." : `${input.total} pendiente(s) normales.`,
  };
}

function paymentRulesCheck(
  input: NonNullable<BookingAutomationReadinessInput["paymentRules"]> | null
) {
  if (!input) {
    return {
      key: "payment_rules",
      label: "Reglas de pago",
      status: "info" as const,
      message: "Configuralas por servicio; no se pudo medir cobertura todavía.",
    };
  }
  if (input.ready) {
    return {
      key: "payment_rules",
      label: "Reglas de pago",
      status: "ok" as const,
      message: `${input.configuredServices}/${input.totalActiveServices} servicio(s) activo(s) con precio configurado.`,
    };
  }
  const examples = input.missingServiceNames.slice(0, 3).join(", ");
  const more = input.missingServiceNames.length > 3 ? "…" : "";
  return {
    key: "payment_rules",
    label: "Reglas de pago",
    status: "warning" as const,
    message: `Faltan reglas en ${input.missingServiceNames.length} servicio(s): ${examples}${more}`,
  };
}

function calendarMappingsCheck(
  input: NonNullable<BookingAutomationReadinessInput["calendarMappings"]> | null
) {
  if (!input) {
    return {
      key: "calendar_mapping",
      label: "Calendarios",
      status: "info" as const,
      message: "Las conexiones por recurso se revisan en cada recurso.",
    };
  }
  if (input.ready) {
    return {
      key: "calendar_mapping",
      label: "Calendarios",
      status: "ok" as const,
      message: `${input.connectedResources}/${input.totalActiveResources} recurso(s) activo(s) con calendario conectado.`,
    };
  }
  const missing = input.missingResourceNames.length;
  const unhealthy = input.unhealthyResourceNames.length;
  const examples = [...input.missingResourceNames, ...input.unhealthyResourceNames]
    .slice(0, 3)
    .join(", ");
  const more = missing + unhealthy > 3 ? "…" : "";
  return {
    key: "calendar_mapping",
    label: "Calendarios",
    status: "warning" as const,
    message: `Faltan ${missing} mapping(s) y ${unhealthy} tienen problemas: ${examples}${more}`,
  };
}

function bookingModeLabel(
  mode: NonNullable<BookingAutomationReadinessInput["aiBooking"]>["mode"]
): string {
  switch (mode) {
    case "suggest_only":
      return "Modo sugerencias activo.";
    case "auto_hold":
      return "Modo auto-hold activo.";
    case "manual_payment_confirm":
      return "Modo seña manual activo.";
    case "disabled":
      return "Las reservas con IA están desactivadas.";
  }
}
