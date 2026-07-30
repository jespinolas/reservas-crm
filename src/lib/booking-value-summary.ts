export type BookingValueSummaryInput = {
  readinessStatus: "ready" | "warning" | "blocked";
};

export type BookingValueSummary = {
  headline: string;
  subheadline: string;
  benefits: string[];
  caution: string;
};

const BENEFITS = [
  "Captura consultas de reserva 24/7, incluso cuando el equipo no puede responder.",
  "Reduce mensajes repetitivos porque la IA guía la conversación y pide los datos mínimos.",
  "Mantiene la confirmación detrás de seña o pago revisado por el negocio.",
  "Evita doble reserva porque disponibilidad, precio y holds salen del CRM.",
];

export function buildBookingValueSummary(input: BookingValueSummaryInput): BookingValueSummary {
  if (input.readinessStatus === "ready") {
    return {
      headline: "Vendé auto-reservas 24/7 con control del negocio",
      subheadline:
        "El flujo está listo para demostrar cómo la IA atiende mensajes mientras el CRM decide disponibilidad, precio y confirmación.",
      benefits: BENEFITS,
      caution:
        "Presentalo como listo para operar, manteniendo claro que pagos y reservas finales pasan por las reglas del CRM.",
    };
  }

  if (input.readinessStatus === "warning") {
    return {
      headline: "El valor ya se puede mostrar, pero falta cerrar detalles",
      subheadline:
        "Usalo para explicar el beneficio comercial mientras se completan pagos, calendarios, pendientes o revisión admin.",
      benefits: BENEFITS,
      caution:
        "No venderlo como activo hasta resolver las advertencias visibles en preparación de auto-reservas.",
    };
  }

  return {
    headline: "Primero completá la base para vender auto-reservas",
    subheadline:
      "El concepto comercial es fuerte, pero todavía falta configuración mínima antes de prometer reservas 24/7.",
    benefits: BENEFITS,
    caution:
      "Usalo solo como explicación conceptual hasta activar modo IA, catálogo y proveedor correctamente.",
  };
}
