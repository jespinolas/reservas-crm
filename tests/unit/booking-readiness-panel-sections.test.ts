import { describe, expect, it } from "vitest";
import {
  buildBookingReadinessPanelDefaultState,
  buildBookingReadinessPanelSections,
} from "@/lib/booking-readiness-panel-sections";

describe("booking readiness panel sections", () => {
  it("defaults operator setup expanded", () => {
    const state = buildBookingReadinessPanelDefaultState();

    expect(state.operator_setup).toBe(true);
  });

  it("defaults sales and demo support collapsed", () => {
    const state = buildBookingReadinessPanelDefaultState();

    expect(state.sales_demo).toBe(false);
  });

  it("returns stable section metadata", () => {
    expect(buildBookingReadinessPanelSections()).toEqual([
      {
        key: "operator_setup",
        title: "Setup operativo",
        description: "Revisión admin, bloqueos, checklist de demo y checks técnicos.",
        defaultExpanded: true,
      },
      {
        key: "sales_demo",
        title: "Soporte de venta y demo",
        description: "Guion, resumen para vender, texto seguro para copiar e impresión.",
        defaultExpanded: false,
      },
    ]);
  });
});
