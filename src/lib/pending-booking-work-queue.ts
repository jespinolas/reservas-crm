export type PendingBookingWorkStatus = "waiting_for_evidence" | "needs_operator_review";

export type PendingBookingWorkVerification = {
  id: string;
  status: PendingBookingWorkStatus;
  expiresAt: string;
  createdAt?: string;
};

export type PendingBookingWorkItem = {
  id: string;
  status: PendingBookingWorkStatus;
  level: "expired" | "urgent" | "review" | "stale" | "waiting";
  label: string;
  actionText: string;
  sortPriority: number;
  expiresAt: string;
};

export type PendingBookingWorkSummary = {
  total: number;
  needsReview: number;
  waitingForEvidence: number;
  urgent: number;
  expired: number;
  stale: number;
};

const URGENCY_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

export function buildPendingBookingWorkQueue(
  verifications: PendingBookingWorkVerification[],
  now = new Date(),
  options: { staleAfterMs?: number } = {}
): { items: PendingBookingWorkItem[]; summary: PendingBookingWorkSummary } {
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const items = verifications
    .map((verification) => buildPendingBookingWorkItem(verification, now, staleAfterMs))
    .filter((item): item is PendingBookingWorkItem => Boolean(item))
    .sort((a, b) => b.sortPriority - a.sortPriority || a.expiresAt.localeCompare(b.expiresAt));

  return {
    items,
    summary: {
      total: items.length,
      needsReview: items.filter((item) => item.status === "needs_operator_review").length,
      waitingForEvidence: items.filter((item) => item.status === "waiting_for_evidence").length,
      urgent: items.filter((item) => item.level === "urgent").length,
      expired: items.filter((item) => item.level === "expired").length,
      stale: items.filter((item) => item.level === "stale").length,
    },
  };
}

function buildPendingBookingWorkItem(
  verification: PendingBookingWorkVerification,
  now: Date,
  staleAfterMs: number
): PendingBookingWorkItem | null {
  const expiresAt = new Date(verification.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const remainingMs = expiresAt.getTime() - now.getTime();
  const expired = remainingMs <= 0;
  const urgent = !expired && remainingMs <= URGENCY_WINDOW_MS;
  const createdAt = verification.createdAt ? new Date(verification.createdAt) : null;
  const stale =
    Boolean(createdAt) &&
    !Number.isNaN(createdAt?.getTime()) &&
    now.getTime() - (createdAt?.getTime() ?? now.getTime()) >= staleAfterMs;

  if (expired) {
    return {
      id: verification.id,
      status: verification.status,
      level: "expired",
      label: "Vencido",
      actionText: "Revisá disponibilidad antes de prometer o confirmar esta reserva.",
      sortPriority: 100,
      expiresAt: expiresAt.toISOString(),
    };
  }

  if (urgent) {
    return {
      id: verification.id,
      status: verification.status,
      level: "urgent",
      label: "Vence pronto",
      actionText:
        verification.status === "needs_operator_review"
          ? "Validá el pago antes de que venza el hold."
          : "Pedile al cliente que envíe el comprobante antes de que venza el hold.",
      sortPriority: 90,
      expiresAt: expiresAt.toISOString(),
    };
  }

  if (verification.status === "needs_operator_review") {
    return {
      id: verification.id,
      status: verification.status,
      level: "review",
      label: "Revisar pago",
      actionText: "Confirmá solo si el negocio recibió la seña.",
      sortPriority: 80,
      expiresAt: expiresAt.toISOString(),
    };
  }

  if (stale) {
    return {
      id: verification.id,
      status: verification.status,
      level: "stale",
      label: "Sin atender",
      actionText: "Este pendiente lleva demasiado tiempo esperando respuesta.",
      sortPriority: 70,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return {
    id: verification.id,
    status: verification.status,
    level: "waiting",
    label: "Falta comprobante",
    actionText: "Pedile al cliente que envíe el comprobante para continuar.",
    sortPriority: 60,
    expiresAt: expiresAt.toISOString(),
  };
}
