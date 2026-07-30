import { describe, expect, it } from "vitest";
import { buildBookingReadinessHistorySummary } from "@/lib/booking-readiness-history";

describe("buildBookingReadinessHistorySummary", () => {
  it("shows never-reviewed copy without a timestamp", () => {
    expect(
      buildBookingReadinessHistorySummary({ readinessLastCheckedAt: null })
    ).toEqual({
      label: "Nunca revisada",
      title: "Todavía no hay una revisión admin registrada.",
    });
  });

  it("formats a valid timestamp for Spanish Paraguay display", () => {
    const summary = buildBookingReadinessHistorySummary({
      readinessLastCheckedAt: "2026-08-01T15:30:00.000Z",
    });

    expect(summary).toEqual({
      label: expect.stringContaining("1/8/26"),
      title: "Última revisión admin registrada.",
    });
  });

  it("handles invalid timestamps explicitly", () => {
    expect(
      buildBookingReadinessHistorySummary({ readinessLastCheckedAt: "not-a-date" })
    ).toEqual({
      label: "Fecha inválida",
      title: "El timestamp de revisión guardado no se pudo leer.",
    });
  });
});
