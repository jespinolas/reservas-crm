export type BookingExpiryGuard = {
  level: "warning" | "expired";
  title: string;
  message: string;
  actionHint: string;
  expiresAt: string;
  minutesRemaining: number;
};

export type BookingExpiryGuardSession = {
  status: string;
  expiresAt: string | null;
};

export type BookingExpiryGuardPaymentVerification = {
  status: string;
  expiresAt: string;
};

const URGENCY_WINDOW_MS = 5 * 60 * 1000;
const TERMINAL_SESSION_STATUSES = new Set(["confirmed", "rejected", "expired", "escalated"]);
const TERMINAL_PAYMENT_STATUSES = new Set(["approved", "rejected", "expired", "cancelled"]);

export function buildBookingExpiryGuard(input: {
  session: BookingExpiryGuardSession | null;
  paymentVerification: BookingExpiryGuardPaymentVerification | null;
  now?: Date;
}): BookingExpiryGuard | null {
  const session = input.session;
  if (!session || TERMINAL_SESSION_STATUSES.has(session.status)) return null;
  const now = input.now ?? new Date();
  const verification = input.paymentVerification;

  if (verification && !TERMINAL_PAYMENT_STATUSES.has(verification.status)) {
    return guardForTarget({
      expiresAt: verification.expiresAt,
      now,
      activeTitle:
        verification.status === "needs_operator_review"
          ? "Pago por revisar está por vencer"
          : "Falta comprobante de pago",
      activeMessage:
        verification.status === "needs_operator_review"
          ? "Si el negocio recibió la seña, revisá y aprobá antes de que venza el hold."
          : "El cliente todavía no envió comprobante. Conviene pedirlo antes de que venza el hold.",
      activeActionHint:
        verification.status === "needs_operator_review"
          ? "Usá Sí, recibido solo si el pago llegó."
          : "Pedile al cliente que envíe el comprobante.",
      expiredTitle: "La revisión de pago venció",
      expiredMessage:
        "El tiempo del hold ya venció o está vencido. El CRM puede rechazar la confirmación.",
      expiredActionHint: "Revisá disponibilidad antes de prometer la reserva.",
    });
  }

  if (session.expiresAt) {
    return guardForTarget({
      expiresAt: session.expiresAt,
      now,
      activeTitle: "Hold está por vencer",
      activeMessage: "Este hold está cerca de expirar.",
      activeActionHint: "Confirmá solo si el flujo de pago está completo.",
      expiredTitle: "Hold vencido",
      expiredMessage: "El tiempo del hold ya venció.",
      expiredActionHint: "Revisá disponibilidad antes de seguir.",
    });
  }

  return null;
}

function guardForTarget(input: {
  expiresAt: string;
  now: Date;
  activeTitle: string;
  activeMessage: string;
  activeActionHint: string;
  expiredTitle: string;
  expiredMessage: string;
  expiredActionHint: string;
}): BookingExpiryGuard | null {
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const remainingMs = expiresAt.getTime() - input.now.getTime();
  const minutesRemaining = Math.ceil(remainingMs / 60000);
  if (remainingMs <= 0) {
    return {
      level: "expired",
      title: input.expiredTitle,
      message: input.expiredMessage,
      actionHint: input.expiredActionHint,
      expiresAt: expiresAt.toISOString(),
      minutesRemaining,
    };
  }
  if (remainingMs <= URGENCY_WINDOW_MS) {
    return {
      level: "warning",
      title: input.activeTitle,
      message: input.activeMessage,
      actionHint: input.activeActionHint,
      expiresAt: expiresAt.toISOString(),
      minutesRemaining,
    };
  }
  return null;
}
