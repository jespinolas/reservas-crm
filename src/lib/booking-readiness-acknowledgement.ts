export type BookingReadinessAcknowledgementInput = {
  summaryStatus: "ready" | "warning" | "blocked";
  storedReadinessStatus: "unknown" | "ready" | "not_ready";
};

export type BookingReadinessAcknowledgementActions = {
  canMarkReady: boolean;
  canMarkNotReady: boolean;
  statusLabel: string;
  explanation: string;
};

export function buildBookingReadinessAcknowledgementActions(
  input: BookingReadinessAcknowledgementInput
): BookingReadinessAcknowledgementActions {
  if (input.summaryStatus === "blocked") {
    return {
      canMarkReady: false,
      canMarkNotReady: input.storedReadinessStatus === "ready",
      statusLabel: storedStatusLabel(input.storedReadinessStatus),
      explanation: "Faltan requisitos bloqueantes antes de marcar auto-reservas como listas.",
    };
  }

  if (input.storedReadinessStatus === "ready") {
    return {
      canMarkReady: false,
      canMarkNotReady: true,
      statusLabel: "Marcada lista",
      explanation: "Un admin ya marcó esta instalación como lista para revisión operativa.",
    };
  }

  return {
    canMarkReady: true,
    canMarkNotReady: false,
    statusLabel: storedStatusLabel(input.storedReadinessStatus),
    explanation:
      input.summaryStatus === "warning"
        ? "Hay advertencias; un admin puede aceptarlas para demo o revisión controlada."
        : "Los requisitos están listos para que un admin confirme la preparación.",
  };
}

function storedStatusLabel(status: BookingReadinessAcknowledgementInput["storedReadinessStatus"]) {
  switch (status) {
    case "ready":
      return "Marcada lista";
    case "not_ready":
      return "Marcada no lista";
    case "unknown":
      return "Sin revisar";
  }
}
