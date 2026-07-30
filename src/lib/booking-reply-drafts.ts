export type BookingReplyDraftAction = {
  id: "confirmed" | "payment_review" | "payment_rejected" | "human_handoff";
  label: string;
  text: string;
};

export type BookingReplyDraftSession = {
  status: string;
  resourceId: string | null;
  serviceId: string | null;
  requestedStartsAt: string | null;
  partySize: number | null;
  reservationId: string | null;
  selectedOptionJsonRedacted: {
    resourceName?: string;
    serviceName?: string;
    startsAt?: string;
    partySize?: number;
  } | null;
};

export type BookingReplyDraftPaymentVerification = {
  status: string;
};

export function buildBookingReplyDraftActions(input: {
  session: BookingReplyDraftSession | null;
  paymentVerification: BookingReplyDraftPaymentVerification | null;
}): BookingReplyDraftAction[] {
  const session = input.session;
  if (!session) return [];

  const actions: BookingReplyDraftAction[] = [];
  const resourceLabel =
    session.selectedOptionJsonRedacted?.resourceName ?? session.resourceId ?? "tu reserva";
  const serviceLabel =
    session.selectedOptionJsonRedacted?.serviceName ?? session.serviceId ?? "el servicio";
  const dateLabel = formatDraftDate(
    session.selectedOptionJsonRedacted?.startsAt ?? session.requestedStartsAt
  );
  const partySize = session.selectedOptionJsonRedacted?.partySize ?? session.partySize;
  const partyLabel = partySize ? ` para ${partySize} persona${partySize === 1 ? "" : "s"}` : "";

  if (
    session.status === "confirmed" ||
    (input.paymentVerification?.status === "approved" && Boolean(session.reservationId))
  ) {
    actions.push({
      id: "confirmed",
      label: "Respuesta: confirmado",
      text: [
        "Perfecto, tu reserva está confirmada.",
        `Tenemos reservado ${resourceLabel} para ${serviceLabel}${dateLabel}${partyLabel}.`,
        "Te esperamos.",
      ].join(" "),
    });
  }

  if (
    input.paymentVerification?.status === "waiting_for_evidence" ||
    input.paymentVerification?.status === "needs_operator_review" ||
    session.status === "awaiting_payment_evidence" ||
    session.status === "awaiting_operator_payment_review"
  ) {
    actions.push({
      id: "payment_review",
      label: "Respuesta: revisando pago",
      text: [
        "Gracias, recibimos la información.",
        "Estamos revisando el pago y te confirmamos apenas el negocio lo valide.",
      ].join(" "),
    });
  }

  if (input.paymentVerification?.status === "rejected" || session.status === "rejected") {
    actions.push({
      id: "payment_rejected",
      label: "Respuesta: pago no recibido",
      text: [
        "Por ahora no pudimos validar el pago.",
        "Podés enviar un nuevo comprobante o escribirnos para revisar el caso.",
      ].join(" "),
    });
  }

  if (session.status === "escalated") {
    actions.push({
      id: "human_handoff",
      label: "Respuesta: atiende humano",
      text: "Te va a seguir atendiendo una persona del equipo por acá.",
    });
  }

  return dedupeDrafts(actions);
}

function formatDraftDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` el ${new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)}`;
}

function dedupeDrafts(actions: BookingReplyDraftAction[]): BookingReplyDraftAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}
