import {
  AiBookingSessionService,
  InMemoryAiBookingSessionRepository,
  type SelectedBookingOption,
} from "@/server/ai/booking-sessions";
import {
  AvailabilityService,
  InMemoryAvailabilityRepository,
} from "@/server/reservations/availability";
import {
  AvailabilityOptionsService,
  InMemoryAvailabilityOptionsRepository,
} from "@/server/reservations/availability-options";
import {
  BookingService,
  InMemoryBookingRepository,
} from "@/server/reservations/booking";
import {
  ManualPaymentVerificationService,
  InMemoryManualPaymentVerificationRepository,
} from "@/server/payments/manual-verifications";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";
import type { ServicePaymentRule } from "@/server/reservations/payment-rules";

const ORGANIZATION_ID = "org_country_house_lab";
const CONTACT_ID = "ct_country_house_lab_customer";
const CONVERSATION_ID = "cv_country_house_lab";
const SERVICE_ID = "rsvc_country_house_stay";
const NOW = new Date("2026-07-30T12:00:00.000Z");
const TARGET_SATURDAY = "2026-08-01";
const TARGET_RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const TARGET_RANGE_END = new Date("2026-08-02T00:00:00.000Z");

export type CountryHouseBookingLabResult = {
  organizationId: string;
  conversationId: string;
  contact: {
    id: string;
    name: string;
    phone: string;
  };
  request: {
    customerText: string;
    targetLocalDate: string;
    requestedResourceName: string;
    partySize: number;
  };
  catalog: {
    resourceCount: number;
    resources: Array<{
      id: string;
      name: string;
      capacity: number;
      perks: string[];
    }>;
    service: {
      id: string;
      name: string;
      durationMinutes: number;
    };
  };
  availability: {
    optionCount: number;
    house3OptionId: string;
    house3StartsAt: string;
    house3EndsAt: string;
    diagnostics: {
      candidateResourceCount: number;
      capacityRejectedCount: number;
      scheduleSlotCount: number;
      conflictRejectedCount: number;
      returnedCount: number;
    };
  };
  payment: {
    expectedAmountMinor: number;
    currency: string;
    statusBeforeApproval: string;
    statusAfterApproval: string;
  };
  booking: {
    sessionId: string;
    sessionStatusBeforeApproval: string;
    finalSessionStatus: string;
    holdId: string;
    holdStatusAfterApproval: string;
    reservationId: string;
    reservationStatus: string;
  };
  transcript: Array<{
    role: "customer" | "ai" | "operator" | "crm";
    text: string;
  }>;
  externalCredentialsRequired: false;
};

export async function runCountryHouseBookingLab(): Promise<CountryHouseBookingLabResult> {
  const repositories = createRepositories();
  const fixture = await seedCountryHouseFixture(repositories);

  const optionsResult = await repositories.optionsService.findAvailableOptions({
    organizationId: ORGANIZATION_ID,
    serviceId: fixture.service.id,
    rangeStart: TARGET_RANGE_START,
    rangeEnd: TARGET_RANGE_END,
    partySize: 4,
    maxOptions: 50,
    now: NOW,
  });
  const house3Option = optionsResult.options.find(
    (option) => option.resource.name === "Casa 3"
  );
  if (!house3Option) {
    throw new Error("country_house_lab_house_3_option_missing");
  }

  const sessionStarted = await repositories.aiBookingSessionService.startSession({
    organizationId: ORGANIZATION_ID,
    conversationId: CONVERSATION_ID,
    contactId: CONTACT_ID,
    serviceId: fixture.service.id,
    resourceId: house3Option.resource.id,
    requestedStartsAt: house3Option.startsAt,
    requestedEndsAt: house3Option.endsAt,
    partySize: 4,
    actorType: "customer",
    actorId: CONTACT_ID,
    now: NOW,
  });
  const showingOptions = await repositories.aiBookingSessionService.transition({
    session: sessionStarted,
    toStatus: "showing_options",
    actorType: "system",
    eventType: "ai_booking.option_presented",
    selectedOptionJsonRedacted: toSelectedOption(house3Option),
    now: NOW,
  });
  const awaitingConfirmation = await repositories.aiBookingSessionService.transition({
    session: showingOptions,
    toStatus: "awaiting_customer_confirmation",
    actorType: "customer",
    actorId: CONTACT_ID,
    selectedOptionJsonRedacted: toSelectedOption(house3Option),
    now: NOW,
  });

  const hold = await repositories.bookingService.createHold({
    organizationId: ORGANIZATION_ID,
    resource: fixture.house3,
    service: fixture.service,
    contactId: CONTACT_ID,
    startsAt: house3Option.startsAt,
    endsAt: house3Option.endsAt,
    expiresAt: new Date("2026-07-30T12:30:00.000Z"),
    idempotencyKey: "country_house_lab_house_3_2026_08_01_party_4",
    now: NOW,
  });
  repositories.manualPaymentRepository.holds.set(hold.id, hold);

  const holdCreated = await repositories.aiBookingSessionService.transition({
    session: awaitingConfirmation,
    toStatus: "hold_created",
    actorType: "system",
    eventType: "ai_booking.hold_created",
    bookingHoldId: hold.id,
    expiresAt: hold.expiresAt,
    now: NOW,
  });

  const expectedDeposit = house3Option.depositDue;
  if (!expectedDeposit) throw new Error("country_house_lab_deposit_missing");
  const paymentWaiting = await repositories.manualPaymentService.createReviewRequest({
    organizationId: ORGANIZATION_ID,
    holdId: hold.id,
    conversationId: CONVERSATION_ID,
    expectedAmountMinor: expectedDeposit.amountMinor,
    currency: expectedDeposit.currency,
    now: NOW,
  });

  const awaitingEvidence = await repositories.aiBookingSessionService.transition({
    session: holdCreated,
    toStatus: "awaiting_payment_evidence",
    actorType: "system",
    eventType: "ai_booking.payment_evidence_requested",
    manualPaymentVerificationId: paymentWaiting.id,
    now: NOW,
  });

  const paymentWithEvidence = await repositories.manualPaymentService.recordInboundEvidence({
    organizationId: ORGANIZATION_ID,
    conversationId: CONVERSATION_ID,
    contactId: CONTACT_ID,
    messageId: "msg_country_house_lab_payment_evidence",
    messageType: "image",
    evidenceMediaId: "fake_lab_payment_evidence_media",
    now: new Date("2026-07-30T12:05:00.000Z"),
  });
  if (!paymentWithEvidence) throw new Error("country_house_lab_payment_evidence_missing");

  const awaitingOperator = await repositories.aiBookingSessionService.transition({
    session: awaitingEvidence,
    toStatus: "awaiting_operator_payment_review",
    actorType: "system",
    eventType: "ai_booking.payment_review_requested",
    now: new Date("2026-07-30T12:05:00.000Z"),
  });

  const approved = await repositories.manualPaymentService.approve({
    organizationId: ORGANIZATION_ID,
    id: paymentWithEvidence.id,
    actorUserId: "usr_country_house_lab_operator",
    note: "Pago fake aprobado para demo local",
    now: new Date("2026-07-30T12:06:00.000Z"),
  });

  const confirmedSession = await repositories.aiBookingSessionService.transition({
    session: awaitingOperator,
    toStatus: "confirmed",
    actorType: "system",
    eventType: "ai_booking.reservation_confirmed",
    reservationId: approved.reservation.id,
    now: new Date("2026-07-30T12:06:00.000Z"),
  });

  return {
    organizationId: ORGANIZATION_ID,
    conversationId: CONVERSATION_ID,
    contact: {
      id: CONTACT_ID,
      name: "Cliente Demo Casa 3",
      phone: "595981000000",
    },
    request: {
      customerText: "Hola, quiero Casa 3 este sábado para 4 personas",
      targetLocalDate: TARGET_SATURDAY,
      requestedResourceName: "Casa 3",
      partySize: 4,
    },
    catalog: {
      resourceCount: fixture.resources.length,
      resources: fixture.resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        capacity: resource.capacity,
        perks: countryHousePerks(resource.name),
      })),
      service: {
        id: fixture.service.id,
        name: fixture.service.name,
        durationMinutes: fixture.service.durationMinutes,
      },
    },
    availability: {
      optionCount: optionsResult.options.length,
      house3OptionId: "opt_country_house_lab_house_3",
      house3StartsAt: house3Option.startsAt.toISOString(),
      house3EndsAt: house3Option.endsAt.toISOString(),
      diagnostics: optionsResult.diagnostics,
    },
    payment: {
      expectedAmountMinor: paymentWaiting.expectedAmountMinor,
      currency: paymentWaiting.currency,
      statusBeforeApproval: paymentWithEvidence.status,
      statusAfterApproval: approved.verification.status,
    },
    booking: {
      sessionId: confirmedSession.id,
      sessionStatusBeforeApproval: awaitingOperator.status,
      finalSessionStatus: confirmedSession.status,
      holdId: hold.id,
      holdStatusAfterApproval: repositories.bookingRepository.holds.get(hold.id)?.status ?? "unknown",
      reservationId: approved.reservation.id,
      reservationStatus: approved.reservation.status,
    },
    transcript: [
      {
        role: "customer",
        text: "Hola, quiero Casa 3 este sábado para 4 personas",
      },
      {
        role: "ai",
        text: `Casa 3 está disponible. La seña calculada por el CRM es ${paymentWaiting.currency} ${paymentWaiting.expectedAmountMinor}.`,
      },
      {
        role: "customer",
        text: "Perfecto, reservo Casa 3. Te envío el comprobante.",
      },
      {
        role: "crm",
        text: "Hold creado y comprobante marcado para revisión del negocio.",
      },
      {
        role: "operator",
        text: "Pago recibido: sí.",
      },
      {
        role: "crm",
        text: "Reserva confirmada después de aprobación manual.",
      },
    ],
    externalCredentialsRequired: false,
  };
}

function createRepositories() {
  const availabilityRepository = new InMemoryAvailabilityRepository();
  const optionsRepository = new InMemoryAvailabilityOptionsRepository();
  const bookingRepository = new InMemoryBookingRepository();
  const manualPaymentRepository = new InMemoryManualPaymentVerificationRepository();
  const aiBookingSessionRepository = new InMemoryAiBookingSessionRepository();
  const bookingService = new BookingService(bookingRepository);
  return {
    availabilityRepository,
    optionsRepository,
    bookingRepository,
    manualPaymentRepository,
    aiBookingSessionService: new AiBookingSessionService(aiBookingSessionRepository),
    optionsService: new AvailabilityOptionsService(
      optionsRepository,
      new AvailabilityService(availabilityRepository)
    ),
    bookingService,
    manualPaymentService: new ManualPaymentVerificationService(
      manualPaymentRepository,
      bookingService
    ),
  };
}

async function seedCountryHouseFixture(repositories: ReturnType<typeof createRepositories>) {
  const configuration: BusinessConfiguration = {
    id: "bcfg_country_house_lab",
    organizationId: ORGANIZATION_ID,
    timezone: "America/Asuncion",
    defaultSlotMinutes: 60,
    defaultHoldMinutes: 30,
    holdsBlockAvailability: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
  repositories.optionsRepository.configuration = configuration;

  const service: ReservationServiceDefinition = {
    id: SERVICE_ID,
    organizationId: ORGANIZATION_ID,
    name: "Estadía de día",
    description: "Demo local: reserva de una casa quinta por bloque.",
    durationMinutes: 60,
    active: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  repositories.optionsRepository.services.set(service.id, service);

  const paymentRule: ServicePaymentRule = {
    id: "rpay_country_house_lab",
    organizationId: ORGANIZATION_ID,
    serviceId: service.id,
    currency: "PYG",
    amountMinor: 500000,
    depositType: "percentage",
    depositAmountMinor: null,
    depositPercentage: 30,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
  repositories.optionsRepository.paymentRules.set(`${ORGANIZATION_ID}:${SERVICE_ID}`, paymentRule);
  repositories.manualPaymentRepository.paymentRules.set(`${ORGANIZATION_ID}:${SERVICE_ID}`, paymentRule);

  const resources = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    return {
      id: `res_country_house_lab_${number}`,
      organizationId: ORGANIZATION_ID,
      name: `Casa ${number}`,
      description: `Casa quinta demo ${number}: ${countryHousePerks(`Casa ${number}`).join(", ")}.`,
      kind: "house" as const,
      location: "San Bernardino, Paraguay",
      capacity: [2, 3, 4, 5, 6, 8, 10, 12, 14, 16][index] ?? 4,
      active: true,
      sortOrder: index,
      createdAt: NOW,
      updatedAt: NOW,
    } satisfies ReservableResource;
  });

  for (const resource of resources) {
    repositories.optionsRepository.resources.set(resource.id, resource);
    await repositories.availabilityRepository.saveResourceSchedule({
      id: `rs_country_house_lab_${resource.id}`,
      organizationId: ORGANIZATION_ID,
      resourceId: resource.id,
      dayOfWeek: 6,
      startMinute: 15 * 60,
      endMinute: 16 * 60,
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const house3 = resources.find((resource) => resource.name === "Casa 3");
  if (!house3) throw new Error("country_house_lab_fixture_missing_house_3");
  return { configuration, service, resources, house3 };
}

function toSelectedOption(
  option: Awaited<
    ReturnType<AvailabilityOptionsService["findAvailableOptions"]>
  >["options"][number]
): SelectedBookingOption {
  return {
    optionId: "opt_country_house_lab_house_3",
    resourceId: option.resource.id,
    resourceName: option.resource.name,
    serviceId: option.service.id,
    serviceName: option.service.name,
    startsAt: option.startsAt.toISOString(),
    endsAt: option.endsAt.toISOString(),
    partySize: option.partySize ?? undefined,
    capacity: option.resource.capacity,
    currency: option.priceEstimate?.currency,
    amountMinor: option.priceEstimate?.amountMinor,
    depositRequired: Boolean(option.depositDue),
    depositAmountMinor: option.depositDue?.amountMinor,
  };
}

function countryHousePerks(name: string): string[] {
  const number = Number(name.replace(/\D/g, ""));
  const perks = [
    "parrilla",
    "piscina",
    "estacionamiento",
    number % 2 === 0 ? "quincho techado" : "galería",
  ];
  if (number >= 6) perks.push("cancha");
  if (number >= 8) perks.push("vista al lago");
  return perks;
}
