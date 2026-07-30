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
    expect(summary.demoChecklist).toMatchObject({
      status: "ready",
      title: "Demo lista",
    });
    expect(summary.demoChecklist.items.every((item) => item.status === "ready")).toBe(true);
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
    expect(summary.demoChecklist).toMatchObject({
      status: "blocked",
      title: "Demo no lista",
    });
    expect(summary.demoChecklist.items.find((item) => item.key === "base_flow")).toMatchObject({
      status: "blocked",
    });
    expect(summary.demoChecklist.items.find((item) => item.key === "admin_signoff")).toMatchObject({
      status: "blocked",
    });
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
    expect(summary.demoChecklist).toMatchObject({
      status: "warning",
      title: "Demo con advertencias",
    });
    expect(summary.demoChecklist.items.find((item) => item.key === "pending_work")).toMatchObject({
      status: "warning",
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
        actionLabel: "Ver pendientes",
        actionHref: "#booking-payment-reviews",
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
    expect(summary.issues.map((issue) => issue.actionHref)).toEqual([
      "#booking-catalog",
      "#booking-payment-reviews",
    ]);
  });

  it("warns when admin signoff is missing even if setup checks are healthy", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: {
        ...readyAiBooking,
        liveBookingAllowed: false,
      },
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

    expect(summary.status).toBe("warning");
    expect(summary.issues).toEqual([]);
    expect(summary.demoChecklist).toMatchObject({
      status: "warning",
      title: "Demo con advertencias",
    });
    expect(summary.demoChecklist.items.find((item) => item.key === "admin_signoff")).toMatchObject({
      status: "warning",
      message: "Falta marcar la preparación como lista antes de venderlo como activo.",
    });
  });

  it("maps readiness issues to deterministic setup shortcuts", () => {
    const summary = buildBookingAutomationReadinessSummary({
      aiBooking: {
        ready: false,
        liveBookingAllowed: false,
        mode: "disabled",
        checks: [
          { key: "booking_mode", ok: false, message: "Las reservas con IA están desactivadas" },
          { key: "catalog", ok: true, message: "Catálogo listo" },
          { key: "ai_provider", ok: false, message: "Proveedor de IA no configurado" },
        ],
      },
      pendingWork: { total: 0, urgent: 0, expired: 0, stale: 0 },
      paymentRules: {
        totalActiveServices: 1,
        configuredServices: 0,
        missingServiceNames: ["Spa"],
        ready: false,
      },
      calendarMappings: {
        totalActiveResources: 1,
        connectedResources: 0,
        missingResourceNames: ["Sala 1"],
        unhealthyResourceNames: [],
        ready: false,
      },
    });

    expect(
      summary.issues.map((issue) => ({
        key: issue.key,
        actionLabel: issue.actionLabel,
        actionHref: issue.actionHref,
      }))
    ).toEqual([
      {
        key: "booking_mode",
        actionLabel: "Abrir configuración IA",
        actionHref: "/agent",
      },
      {
        key: "ai_provider",
        actionLabel: "Abrir configuración IA",
        actionHref: "/agent",
      },
      {
        key: "payment_rules",
        actionLabel: "Configurar pagos",
        actionHref: "#booking-payment-rules",
      },
      {
        key: "calendar_mapping",
        actionLabel: "Revisar calendarios",
        actionHref: "#booking-catalog",
      },
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
