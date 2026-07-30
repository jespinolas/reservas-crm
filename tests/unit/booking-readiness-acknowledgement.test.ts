import { describe, expect, it } from "vitest";
import { buildBookingReadinessAcknowledgementActions } from "@/lib/booking-readiness-acknowledgement";

describe("buildBookingReadinessAcknowledgementActions", () => {
  it("does not allow marking ready when summary is blocked", () => {
    const actions = buildBookingReadinessAcknowledgementActions({
      summaryStatus: "blocked",
      storedReadinessStatus: "unknown",
    });

    expect(actions).toMatchObject({
      canMarkReady: false,
      canMarkNotReady: false,
      statusLabel: "Sin revisar",
    });
  });

  it("allows marking ready when summary is warning or ready", () => {
    expect(
      buildBookingReadinessAcknowledgementActions({
        summaryStatus: "warning",
        storedReadinessStatus: "not_ready",
      })
    ).toMatchObject({ canMarkReady: true, canMarkNotReady: false });
    expect(
      buildBookingReadinessAcknowledgementActions({
        summaryStatus: "ready",
        storedReadinessStatus: "unknown",
      })
    ).toMatchObject({ canMarkReady: true, canMarkNotReady: false });
  });

  it("allows marking not ready when stored state is ready", () => {
    const actions = buildBookingReadinessAcknowledgementActions({
      summaryStatus: "ready",
      storedReadinessStatus: "ready",
    });

    expect(actions).toMatchObject({
      canMarkReady: false,
      canMarkNotReady: true,
      statusLabel: "Marcada lista",
    });
  });

  it("allows clearing ready acknowledgement even if checks later become blocked", () => {
    const actions = buildBookingReadinessAcknowledgementActions({
      summaryStatus: "blocked",
      storedReadinessStatus: "ready",
    });

    expect(actions).toMatchObject({
      canMarkReady: false,
      canMarkNotReady: true,
    });
  });
});
