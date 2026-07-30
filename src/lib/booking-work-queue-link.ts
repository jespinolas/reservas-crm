export type BookingWorkQueueLinkVerification = {
  conversationId: string | null;
  status: "waiting_for_evidence" | "needs_operator_review";
};

export type BookingWorkQueueInboxAction = {
  href: string;
  label: string;
  title: string;
};

export function buildBookingWorkQueueInboxAction(
  verification: BookingWorkQueueLinkVerification
): BookingWorkQueueInboxAction | null {
  if (!verification.conversationId) return null;
  const href = `/inbox?conversation=${encodeURIComponent(verification.conversationId)}`;
  if (verification.status === "waiting_for_evidence") {
    return {
      href,
      label: "Abrir chat",
      title: "Abrí el chat y usá la respuesta rápida para pedir el comprobante.",
    };
  }
  return {
    href,
    label: "Abrir chat",
    title: "Abrí el chat para revisar contexto antes de decidir el pago.",
  };
}
