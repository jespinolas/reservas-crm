export type ReservasPlanTier = "lite" | "standard" | "automation";

export type LiteFeatureKey =
  | "publicBookingRequestPage"
  | "manualRequestInbox"
  | "personalWhatsappHandoff"
  | "manualPaymentTracker"
  | "calendarExport"
  | "upgradeReadiness"
  | "whatsappApi"
  | "aiReplies"
  | "autoHold"
  | "paymentProcessor"
  | "googleCalendarOAuth";

export type PlanEntitlements = Record<LiteFeatureKey, boolean>;

const entitlementMatrix: Record<ReservasPlanTier, PlanEntitlements> = {
  lite: {
    publicBookingRequestPage: true,
    manualRequestInbox: true,
    personalWhatsappHandoff: true,
    manualPaymentTracker: true,
    calendarExport: true,
    upgradeReadiness: true,
    whatsappApi: false,
    aiReplies: false,
    autoHold: false,
    paymentProcessor: false,
    googleCalendarOAuth: false,
  },
  standard: {
    publicBookingRequestPage: true,
    manualRequestInbox: true,
    personalWhatsappHandoff: true,
    manualPaymentTracker: true,
    calendarExport: true,
    upgradeReadiness: true,
    whatsappApi: true,
    aiReplies: false,
    autoHold: false,
    paymentProcessor: false,
    googleCalendarOAuth: true,
  },
  automation: {
    publicBookingRequestPage: true,
    manualRequestInbox: true,
    personalWhatsappHandoff: true,
    manualPaymentTracker: true,
    calendarExport: true,
    upgradeReadiness: true,
    whatsappApi: true,
    aiReplies: true,
    autoHold: true,
    paymentProcessor: true,
    googleCalendarOAuth: true,
  },
};

export function getPlanEntitlements(tier: ReservasPlanTier): PlanEntitlements {
  return { ...entitlementMatrix[tier] };
}

export function resolvePlanTier(value: string | null | undefined): ReservasPlanTier {
  if (value === "standard" || value === "automation") return value;
  return "lite";
}

export function getLiteTierSalesCopy() {
  return {
    title: "Reservas Manual Lite",
    hook:
      "Turn WhatsApp chaos into organized reservation requests, confirmations, payment tracking, and a shareable booking page — without WhatsApp Business API or AI.",
    promise:
      "Empezá con una página de solicitud, bandeja manual, respuestas listas para WhatsApp y exportación de calendario. Cuando quieras 24/7 AI, tus datos ya están ordenados.",
  };
}
