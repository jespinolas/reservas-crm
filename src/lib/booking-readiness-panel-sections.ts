export type BookingReadinessPanelSectionKey = "operator_setup" | "sales_demo";

export type BookingReadinessPanelSection = {
  key: BookingReadinessPanelSectionKey;
  title: string;
  description: string;
  defaultExpanded: boolean;
};

export function buildBookingReadinessPanelSections(): BookingReadinessPanelSection[] {
  return [
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
  ];
}

export function buildBookingReadinessPanelDefaultState(): Record<
  BookingReadinessPanelSectionKey,
  boolean
> {
  return buildBookingReadinessPanelSections().reduce(
    (state, section) => ({ ...state, [section.key]: section.defaultExpanded }),
    {} as Record<BookingReadinessPanelSectionKey, boolean>
  );
}
