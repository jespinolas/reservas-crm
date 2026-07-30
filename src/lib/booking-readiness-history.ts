export type BookingReadinessHistorySummary = {
  label: string;
  title: string;
};

export function buildBookingReadinessHistorySummary(input: {
  readinessLastCheckedAt: string | null;
}): BookingReadinessHistorySummary {
  if (!input.readinessLastCheckedAt) {
    return {
      label: "Nunca revisada",
      title: "Todavía no hay una revisión admin registrada.",
    };
  }
  const date = new Date(input.readinessLastCheckedAt);
  if (Number.isNaN(date.getTime())) {
    return {
      label: "Fecha inválida",
      title: "El timestamp de revisión guardado no se pudo leer.",
    };
  }
  return {
    label: new Intl.DateTimeFormat("es-PY", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date),
    title: "Última revisión admin registrada.",
  };
}
