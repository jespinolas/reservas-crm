import { z } from "zod";

export type LiteHandoffTemplateKind =
  | "request_received"
  | "availability_follow_up"
  | "payment_request"
  | "confirmation"
  | "decline"
  | "reschedule"
  | "reminder";

export type LiteHandoffInput = {
  kind: LiteHandoffTemplateKind;
  businessName: string;
  customerName: string;
  customerPhone?: string | null;
  serviceName: string;
  resourceName?: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  priceDisplay?: string | null;
  depositDisplay?: string | null;
  paymentInstructions?: string | null;
};

export type LiteHandoffTemplate = {
  kind: LiteHandoffTemplateKind;
  body: string;
  waMeUrl: string | null;
  sendMode: "copy_only" | "personal_whatsapp_link";
  disclaimer: string;
};

export function buildLiteHandoffTemplate(input: LiteHandoffInput): LiteHandoffTemplate {
  const parsed = handoffInputSchema.parse(input);
  const when = formatDateTimeRange(parsed.startsAt, parsed.endsAt);
  const resource = parsed.resourceName ? ` en ${parsed.resourceName}` : "";
  const price = parsed.priceDisplay ? `\nPrecio estimado: ${parsed.priceDisplay}` : "";
  const deposit = parsed.depositDisplay ? `\nSeña requerida: ${parsed.depositDisplay}` : "";
  const instructions = parsed.paymentInstructions
    ? `\nDatos de pago: ${parsed.paymentInstructions}`
    : "";

  const bodyByKind: Record<LiteHandoffTemplateKind, string> = {
    request_received: `Hola ${parsed.customerName}, recibimos tu solicitud para ${parsed.serviceName}${resource} el ${when} para ${parsed.partySize} persona(s). Está sujeta a confirmación. Te avisamos apenas revisemos disponibilidad.${price}${deposit}`,
    availability_follow_up: `Hola ${parsed.customerName}, estamos revisando disponibilidad para ${parsed.serviceName}${resource} el ${when}. Te confirmamos por este medio en breve.${price}${deposit}`,
    payment_request: `Hola ${parsed.customerName}, podemos avanzar con tu solicitud de ${parsed.serviceName}${resource} el ${when}. Para confirmar, necesitamos la seña indicada.${deposit || price}${instructions}\nCuando pagues, enviame el comprobante por acá.`,
    confirmation: `Hola ${parsed.customerName}, tu reserva de ${parsed.serviceName}${resource} para el ${when} quedó confirmada. Te esperamos.`,
    decline: `Hola ${parsed.customerName}, gracias por escribir. No tenemos disponibilidad para ${parsed.serviceName}${resource} el ${when}. Si querés, buscamos otra fecha u horario.`,
    reschedule: `Hola ${parsed.customerName}, para ${parsed.serviceName}${resource} el ${when} necesitamos coordinar otro horario. Enviame dos opciones y lo reviso.`,
    reminder: `Hola ${parsed.customerName}, te recordamos tu reserva de ${parsed.serviceName}${resource} para el ${when}. Si necesitás cambiar algo, avisame con tiempo.`,
  };

  const phone = normalizePhoneForWaMe(parsed.customerPhone ?? null);
  const body = bodyByKind[parsed.kind];
  return {
    kind: parsed.kind,
    body,
    waMeUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(body)}` : null,
    sendMode: phone ? "personal_whatsapp_link" : "copy_only",
    disclaimer:
      "El CRM no envía este mensaje automáticamente. El operador debe copiarlo o abrir WhatsApp personal y enviarlo manualmente.",
  };
}

export function normalizePhoneForWaMe(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function formatDateTimeRange(startsAt: Date, endsAt: Date): string {
  const formatter = new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Asuncion",
  });
  const timeFormatter = new Intl.DateTimeFormat("es-PY", {
    timeStyle: "short",
    timeZone: "America/Asuncion",
  });
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "short",
    timeZone: "America/Asuncion",
  });
  const sameLocalDate = dateFormatter.format(startsAt) === dateFormatter.format(endsAt);
  return sameLocalDate
    ? `${formatter.format(startsAt)} a ${timeFormatter.format(endsAt)}`
    : `${formatter.format(startsAt)} a ${formatter.format(endsAt)}`;
}

const handoffInputSchema = z.object({
  kind: z.enum([
    "request_received",
    "availability_follow_up",
    "payment_request",
    "confirmation",
    "decline",
    "reschedule",
    "reminder",
  ]),
  businessName: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().nullable().optional(),
  serviceName: z.string().trim().min(1),
  resourceName: z.string().trim().nullable().optional(),
  startsAt: z.date(),
  endsAt: z.date(),
  partySize: z.number().int().min(1),
  priceDisplay: z.string().trim().nullable().optional(),
  depositDisplay: z.string().trim().nullable().optional(),
  paymentInstructions: z.string().trim().nullable().optional(),
});
