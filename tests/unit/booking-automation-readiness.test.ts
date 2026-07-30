import { describe, expect, it } from "vitest";
import { buildBookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";

const readyAiBooking = {
  ready: true,
  liveBookingAllowed: true,
  mode: "manual_payment_confirm" as const,
  checks: [
    { key: "booking_mode", ok: true, message: "Modo de reservas con IA configurado" },
    { key: "catalog", ok: true, message: "Catálogo listo" },
    { key: "ai_provider", ok: true, message: "Proveedor de IA configurado" },
  ],
};

describe("buildBookingAutomationReadinessSummary", () => {
  it("returns ready when base readiness and operations are healthy", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: readyAiBooking,
      pendingWork: { total: 0, urgent: 0, expired: 0, stale: 0 },
      paymentRules: {
        totalActiveServices: 1,
        configuredServices: 1,
        missingServiceNames: [],
        ready: true,
      },
      calendarMappings: {
        totalActiveResources: 1,
        connectedResources: 1,
        missingResourceNames: [],
        unhealthyResourceNames: [],
        ready: true,
      },
    });

    expect(summary).toMatchObject({
      status: "ready",
      title: "Auto-reservas listas",
    });
    expect(summary.issues).toEqual([]);
    expect(summary.checks.find((check) => check.key === "pending_work")).toMatchObject({
      status: "ok",
    });
    expect(summary.checks.find((check) => check.key === "payment_rules")).toMatchObject({
      status: "ok",
    });
    expect(summary.checks.find((check) => check.key === "calendar_mapping")).toMatchObject({
      status: "ok",
    });
  });

  it("blocks when booking mode, catalog, or provider readiness is missing", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: {
        ready: false,
        liveBookingAllowed: false,
        mode: "disabled",
        checks: [
          { key: "booking_mode", ok: false, message: "Las reservas con IA están desactivadas" },
          { key: "catalog", ok: false, message: "Faltan recursos o servicios activos" },
          { key: "ai_provider", ok: false, message: "Proveedor de IA no configurado" },
        ],
      },
      pendingWork: { total: 0, urgent: 0, expired: 0, stale: 0 },
      paymentRules: null,
      calendarMappings: null,
    });

    expect(summary.status).toBe("blocked");
    expect(summary.checks.filter((check) => check.status === "blocked").length).toBeGreaterThan(0);
    expect(summary.issues.map((issue) => issue.severity)).toEqual([
      "blocked",
      "blocked",
      "blocked",
    ]);
  });

  it("warns when pending work is urgent or stale", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: readyAiBooking,
      pendingWork: { total: 3, urgent: 1, expired: 0, stale: 1 },
      paymentRules: {
        totalActiveServices: 1,
        configuredServices: 1,
        missingServiceNames: [],
        ready: true,
      },
      calendarMappings: {
        totalActiveResources: 1,
        connectedResources: 1,
        missingResourceNames: [],
        unhealthyResourceNames: [],
        ready: true,
      },
    });

    expect(summary).toMatchObject({
      status: "warning",
      title: "Auto-reservas casi listas",
    });
    expect(summary.checks.find((check) => check.key === "pending_work")).toMatchObject({
      status: "warning",
      message: "2 pendiente(s) urgentes o sin atender.",
    });
    expect(summary.issues).toEqual([
      {
        key: "pending_work",
        label: "Trabajo pendiente",
        severity: "warning",
        message: "2 pendiente(s) urgentes o sin atender.",
      },
    ]);
  });

  it("prioritizes blocked issues before warning issues", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: {
        ready: false,
        liveBookingAllowed: false,
        mode: "suggest_only",
        checks: [
          { key: "booking_mode", ok: true, message: "Modo de reservas con IA configurado" },
          { key: "catalog", ok: false, message: "Faltan recursos o servicios activos" },
          { key: "ai_provider", ok: true, message: "Proveedor de IA configurado" },
        ],
      },
      pendingWork: { total: 1, urgent: 1, expired: 0, stale: 0 },
      paymentRules: {
        totalActiveServices: 1,
        configuredServices: 1,
        missingServiceNames: [],
        ready: true,
      },
      calendarMappings: {
        totalActiveResources: 1,
        connectedResources: 1,
        missingResourceNames: [],
        unhealthyResourceNames: [],
        ready: true,
      },
    });

    expect(summary.issues.map((issue) => `${issue.severity}:${issue.key}`)).toEqual([
      "blocked:catalog",
      "warning:pending_work",
    ]);
  });

  it("warns when payment-rule coverage is incomplete", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: readyAiBooking,
      pendingWork: { total: 0, urgent: 0, expired: 0, stale: 0 },
      paymentRules: {
        totalActiveServices: 2,
        configuredServices: 1,
        missingServiceNames: ["Spa"],
        ready: false,
      },
      calendarMappings: {
        totalActiveResources: 1,
        connectedResources: 1,
        missingResourceNames: [],
        unhealthyResourceNames: [],
        ready: true,
      },
    });

    expect(summary.status).toBe("warning");
    expect(summary.checks.find((check) => check.key === "payment_rules")).toMatchObject({
      status: "warning",
      message: "Faltan reglas en 1 servicio(s): Spa",
    });
  });

  it("warns when calendar mapping coverage is incomplete", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: readyAiBooking,
      pendingWork: { total: 0, urgent: 0, expired: 0, stale: 0 },
      paymentRules: {
        totalActiveServices: 1,
        configuredServices: 1,
        missingServiceNames: [],
        ready: true,
      },
      calendarMappings: {
        totalActiveResources: 2,
        connectedResources: 1,
        missingResourceNames: ["Casa 2"],
        unhealthyResourceNames: ["Casa 3"],
        ready: false,
      },
    });

    expect(summary.status).toBe("warning");
    expect(summary.checks.find((check) => check.key === "calendar_mapping")).toMatchObject({
      status: "warning",
      message: "Faltan 1 mapping(s) y 1 tienen problemas: Casa 2, Casa 3",
    });
  });
});
