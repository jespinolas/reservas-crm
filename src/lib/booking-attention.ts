export type BookingAttentionLevel = "expired" | "urgent" | "review" | "waiting";

export type BookingAttention = {
  level: BookingAttentionLevel;
  label: string;
  title: string;
  sortPriority: number;
  expiresAt: string;
};

export type BookingAttentionPaymentVerification = {
  conversationId: string | null;
  status: "waiting_for_evidence" | "needs_operator_review";
  expiresAt: string;
};

const URGENCY_WINDOW_MS = 5 * 60 * 1000;

export function buildBookingAttention(input: {
  verification: BookingAttentionPaymentVerification;
  now?: Date;
}): BookingAttention | null {
  const expiresAt = new Date(input.verification.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const now = input.now ?? new Date();
  const remainingMs = expiresAt.getTime() - now.getTime();
  const expired = remainingMs <= 0;
  const urgent = !expired && remainingMs <= URGENCY_WINDOW_MS;

  if (expired) {
    return {
      level: "expired",
      label: "Vencido",
      title: "Hold o revisión de pago vencida",
      sortPriority: 100,
      expiresAt: expiresAt.toISOString(),
    };
  }

  if (urgent) {
    return {
      level: "urgent",
      label: "Vence pronto",
      title: "Booking o pago cerca de vencer",
      sortPriority: 90,
      expiresAt: expiresAt.toISOString(),
    };
  }

  if (input.verification.status === "needs_operator_review") {
    return {
      level: "review",
      label: "Revisar pago",
      title: "Comprobante recibido; falta validar pago",
      sortPriority: 80,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return {
    level: "waiting",
    label: "Falta comprobante",
    title: "Cliente aún debe enviar comprobante de seña",
    sortPriority: 60,
    expiresAt: expiresAt.toISOString(),
  };
}

export function buildBookingAttentionMap(
  verifications: BookingAttentionPaymentVerification[],
  now?: Date
): Map<string, BookingAttention> {
  const byConversation = new Map<string, BookingAttention>();
  for (const verification of verifications) {
    if (!verification.conversationId) continue;
    const attention = buildBookingAttention({ verification, now });
    if (!attention) continue;
    const existing = byConversation.get(verification.conversationId);
    if (!existing || attention.sortPriority > existing.sortPriority) {
      byConversation.set(verification.conversationId, attention);
    }
  }
  return byConversation;
}
