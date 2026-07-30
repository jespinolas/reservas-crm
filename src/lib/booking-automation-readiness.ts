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
};

export type BookingAutomationReadinessSummary = {
  status: "ready" | "warning" | "blocked";
  title: string;
  message: string;
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
    {
      key: "payment_rules",
      label: "Reglas de pago",
      status: "info",
      message: "Configuralas por servicio; la cobertura total se medirá en una próxima versión.",
    },
    {
      key: "calendar_mapping",
      label: "Calendarios",
      status: "info",
      message: "Las conexiones por recurso se revisan en cada recurso.",
    },
  ];

  if (!bookingReady) {
    return {
      status: "blocked",
      title: "Auto-reservas no listas",
      message: "Falta completar requisitos básicos antes de vender reservas 24/7.",
      checks,
    };
  }

  if (!liveAllowed || hasOperationalWarning) {
    return {
      status: "warning",
      title: "Auto-reservas casi listas",
      message: hasOperationalWarning
        ? "La configuración base está lista, pero hay trabajo operativo pendiente."
        : "La configuración base está lista, pero falta marcarla como lista para vivo.",
      checks,
    };
  }

  return {
    status: "ready",
    title: "Auto-reservas listas",
    message: "El negocio tiene la base mínima para operar reservas asistidas por IA.",
    checks,
  };
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
