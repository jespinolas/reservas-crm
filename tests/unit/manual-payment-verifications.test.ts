import { describe, expect, it } from "vitest";
import {
  InMemoryBookingRepository,
  BookingService,
  type BookingHold,
} from "@/server/reservations/booking";
import {
  InMemoryManualPaymentVerificationRepository,
  ManualPaymentVerificationError,
  ManualPaymentVerificationService,
} from "@/server/payments/manual-verifications";
import type {
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";
import type { ServicePaymentRule } from "@/server/reservations/payment-rules";

const now = new Date("2026-07-29T12:00:00.000Z");

function fixture() {
  const bookingRepository = new InMemoryBookingRepository();
  const manualRepository = new InMemoryManualPaymentVerificationRepository();
  const bookingService = new BookingService(bookingRepository);
  const service = new ManualPaymentVerificationService(manualRepository, bookingService);
  return { bookingRepository, manualRepository, bookingService, service };
}

function resource(overrides: Partial<ReservableResource> = {}): ReservableResource {
  return {
    id: "res_1",
    organizationId: "org_1",
    name: "Casa 3",
    description: null,
    kind: "house",
    location: null,
    capacity: 4,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function reservationService(
  overrides: Partial<ReservationServiceDefinition> = {}
): ReservationServiceDefinition {
  return {
    id: "rsvc_1",
    organizationId: "org_1",
    name: "Estadía",
    description: null,
    durationMinutes: 60,
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function createHold(input: {
  bookingService: BookingService;
  manualRepository: InMemoryManualPaymentVerificationRepository;
  expiresAt?: Date;
}): Promise<BookingHold> {
  const hold = await input.bookingService.createHold({
    organizationId: "org_1",
    resource: resource(),
    service: reservationService(),
    contactId: "ct_1",
    startsAt: new Date("2026-08-01T15:00:00.000Z"),
    endsAt: new Date("2026-08-01T16:00:00.000Z"),
    expiresAt: input.expiresAt ?? new Date("2026-07-29T12:10:00.000Z"),
    idempotencyKey: "manual_payment_hold",
    now,
  });
  input.manualRepository.holds.set(hold.id, hold);
  return hold;
}

function paymentRule(overrides: Partial<ServicePaymentRule> = {}): ServicePaymentRule {
  return {
    id: "rpay_1",
    organizationId: "org_1",
    serviceId: "rsvc_1",
    currency: "PYG",
    amountMinor: 500000,
    depositType: "percentage",
    depositAmountMinor: null,
    depositPercentage: 30,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ManualPaymentVerificationService", () => {
  it("creates an operator review request when customer evidence is present", async () => {
    const { service, manualRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });

    const verification = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      conversationId: "cv_1",
      expectedAmountMinor: 150000,
      currency: "pyg",
      evidence: {
        evidenceMessageId: "msg_1",
        evidenceMediaId: "wamid_media",
        customerReferenceRedacted: "Transferencia [redacted]",
      },
      now,
    });

    expect(verification).toMatchObject({
      organizationId: "org_1",
      bookingHoldId: hold.id,
      conversationId: "cv_1",
      contactId: "ct_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      status: "needs_operator_review",
      expectedAmountMinor: 150000,
      currency: "PYG",
    });
    expect(manualRepository.histories.at(-1)).toMatchObject({
      toStatus: "needs_operator_review",
      actorType: "system",
    });
  });

  it("returns the existing active request for duplicate evidence on the same hold", async () => {
    const { service, manualRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });

    const first = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      expectedAmountMinor: 150000,
      currency: "PYG",
      now,
    });
    const second = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      expectedAmountMinor: 150000,
      currency: "PYG",
      evidence: { evidenceMessageId: "msg_2" },
      now,
    });

    expect(second).toMatchObject({
      id: first.id,
      status: "needs_operator_review",
      evidenceMessageId: "msg_2",
    });
    expect(manualRepository.verifications.size).toBe(1);
  });

  it("attaches inbound text evidence to an existing waiting request", async () => {
    const { service, manualRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });
    const waiting = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      conversationId: "cv_1",
      expectedAmountMinor: 150000,
      currency: "PYG",
      now,
    });

    const updated = await service.recordInboundEvidence({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      messageId: "msg_payment_text",
      messageType: "text",
      text: "Ya pagué la transferencia 1234567890",
      now,
    });

    expect(updated).toMatchObject({
      id: waiting.id,
      status: "needs_operator_review",
      evidenceMessageId: "msg_payment_text",
      customerReferenceRedacted: "Ya pagué la transferencia [redacted]",
    });
    expect(manualRepository.histories.at(-1)).toMatchObject({
      reason: "customer_payment_evidence_attached",
    });
  });

  it("creates a review request from inbound image evidence for the latest active payment-gated hold", async () => {
    const { service, manualRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });
    manualRepository.paymentRules.set("org_1:rsvc_1", paymentRule());

    const verification = await service.recordInboundEvidence({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      messageId: "msg_image",
      messageType: "image",
      evidenceMediaId: "wamid_media_1",
      now,
    });

    expect(verification).toMatchObject({
      bookingHoldId: hold.id,
      conversationId: "cv_1",
      status: "needs_operator_review",
      expectedAmountMinor: 150000,
      currency: "PYG",
      evidenceMessageId: "msg_image",
      evidenceMediaId: "wamid_media_1",
    });
  });

  it("keeps one active review request when duplicate inbound evidence arrives", async () => {
    const { service, manualRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });
    manualRepository.paymentRules.set("org_1:rsvc_1", paymentRule());

    const first = await service.recordInboundEvidence({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      messageId: "msg_image_1",
      messageType: "image",
      evidenceMediaId: "wamid_media_1",
      now,
    });
    const second = await service.recordInboundEvidence({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      messageId: "msg_image_2",
      messageType: "image",
      evidenceMediaId: "wamid_media_2",
      now,
    });

    expect(first?.bookingHoldId).toBe(hold.id);
    expect(second).toMatchObject({
      id: first?.id,
      bookingHoldId: hold.id,
      status: "needs_operator_review",
      evidenceMessageId: "msg_image_2",
      evidenceMediaId: "wamid_media_2",
    });
    expect(manualRepository.verifications.size).toBe(1);
    await expect(
      service.list({
        organizationId: "org_1",
        conversationId: "cv_1",
        statuses: ["needs_operator_review"],
      })
    ).resolves.toHaveLength(1);
  });

  it("ignores normal text and holds without required deposits", async () => {
    const { service, manualRepository, bookingService } = fixture();
    await createHold({ bookingService, manualRepository });

    await expect(
      service.recordInboundEvidence({
        organizationId: "org_1",
        conversationId: "cv_1",
        contactId: "ct_1",
        messageId: "msg_hello",
        messageType: "text",
        text: "hola, una consulta",
        now,
      })
    ).resolves.toBeNull();

    await expect(
      service.recordInboundEvidence({
        organizationId: "org_1",
        conversationId: "cv_1",
        contactId: "ct_1",
        messageId: "msg_image_no_rule",
        messageType: "image",
        evidenceMediaId: "wamid_media_2",
        now,
      })
    ).resolves.toBeNull();
  });

  it("lists pending requests by conversation", async () => {
    const { service, manualRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });
    await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      conversationId: "cv_1",
      expectedAmountMinor: 150000,
      currency: "PYG",
      evidence: { evidenceMessageId: "msg_1" },
      now,
    });

    await expect(
      service.list({
        organizationId: "org_1",
        conversationId: "cv_1",
        statuses: ["needs_operator_review"],
      })
    ).resolves.toHaveLength(1);
    await expect(
      service.list({
        organizationId: "org_1",
        conversationId: "cv_other",
        statuses: ["needs_operator_review"],
      })
    ).resolves.toHaveLength(0);
  });

  it("approves payment by confirming the active hold exactly once", async () => {
    const { service, manualRepository, bookingRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });
    const verification = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      expectedAmountMinor: 150000,
      currency: "PYG",
      evidence: { evidenceMessageId: "msg_1" },
      now,
    });

    const first = await service.approve({
      organizationId: "org_1",
      id: verification.id,
      actorUserId: "usr_1",
      note: "Recibido",
      now,
    });
    const second = await service.approve({
      organizationId: "org_1",
      id: verification.id,
      actorUserId: "usr_1",
      now,
    });

    expect(first.reservation).toMatchObject({
      holdId: hold.id,
      status: "confirmed",
      resourceId: "res_1",
    });
    expect(second.reservation.id).toBe(first.reservation.id);
    expect(bookingRepository.reservations.size).toBe(1);
    expect(manualRepository.verifications.get(verification.id)).toMatchObject({
      status: "approved",
      reviewedByUserId: "usr_1",
    });
  });

  it("rejects payment without confirming the hold", async () => {
    const { service, manualRepository, bookingRepository, bookingService } = fixture();
    const hold = await createHold({ bookingService, manualRepository });
    const verification = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      expectedAmountMinor: 150000,
      currency: "PYG",
      evidence: { evidenceMessageId: "msg_1" },
      now,
    });

    await expect(
      service.reject({
        organizationId: "org_1",
        id: verification.id,
        actorUserId: "usr_1",
        reason: "not_received",
        now,
      })
    ).resolves.toMatchObject({ status: "rejected" });
    expect(bookingRepository.reservations.size).toBe(0);
    await expect(
      service.approve({
        organizationId: "org_1",
        id: verification.id,
        actorUserId: "usr_1",
        now,
      })
    ).rejects.toMatchObject({ code: "invalid_status" });
  });

  it("does not approve payment after the hold expires", async () => {
    const { service, manualRepository, bookingRepository, bookingService } = fixture();
    const hold = await createHold({
      bookingService,
      manualRepository,
      expiresAt: new Date("2026-07-29T12:01:00.000Z"),
    });
    const verification = await service.createReviewRequest({
      organizationId: "org_1",
      holdId: hold.id,
      expectedAmountMinor: 150000,
      currency: "PYG",
      evidence: { evidenceMessageId: "msg_1" },
      now,
    });

    await expect(
      service.approve({
        organizationId: "org_1",
        id: verification.id,
        actorUserId: "usr_1",
        now: new Date("2026-07-29T12:02:00.000Z"),
      })
    ).rejects.toBeInstanceOf(ManualPaymentVerificationError);
    expect(manualRepository.verifications.get(verification.id)?.status).toBe("expired");
    expect(bookingRepository.reservations.size).toBe(0);
  });
});
