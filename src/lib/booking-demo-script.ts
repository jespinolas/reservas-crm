export type BookingDemoScriptInput = {
  demoStatus: "ready" | "warning" | "blocked";
};

export type BookingDemoScript = {
  badge: string;
  framing: string;
  customerPrompt: string;
  expectedAssistantReply: string;
  operatorNote: string;
};

export function buildBookingDemoScript(input: BookingDemoScriptInput): BookingDemoScript {
  if (input.demoStatus === "ready") {
    return {
      badge: "Lista para demo",
      framing: "Mostrá el flujo como una reserva 24/7 lista para operar con revisión humana de pagos.",
      customerPrompt:
        "Hola, quiero reservar una casa para este sábado para 4 personas. ¿Qué opciones hay?",
      expectedAssistantReply:
        "Te puedo ofrecer opciones disponibles, indicar el precio calculado por el CRM y pedir la seña antes de confirmar.",
      operatorNote:
        "Aclarar que disponibilidad, precio, seña y confirmación salen del CRM; la IA solo conversa y guía.",
    };
  }

  if (input.demoStatus === "warning") {
    return {
      badge: "Demo con cuidado",
      framing: "Mostrá el flujo como demostración controlada y mencioná qué falta antes de venderlo como activo.",
      customerPrompt:
        "Hola, quiero reservar una casa para este sábado para 4 personas. ¿Qué opciones hay?",
      expectedAssistantReply:
        "Puedo mostrar cómo la IA pediría datos y consultaría opciones, pero todavía hay configuración por cerrar antes de activarlo.",
      operatorNote:
        "No prometer operación en vivo hasta limpiar advertencias, pagos, calendarios o revisión admin.",
    };
  }

  return {
    badge: "Solo sandbox",
    framing: "No lo presentes como listo. Usá el guion solo para explicar el concepto mientras se completa el setup.",
    customerPrompt:
      "Hola, quiero reservar una casa para este sábado para 4 personas. ¿Qué opciones hay?",
    expectedAssistantReply:
      "Primero hay que completar modo IA, catálogo y proveedor antes de simular respuestas de reserva.",
    operatorNote:
      "Mantener la demo conceptual: sin prometer disponibilidad real, precios reales, pagos ni reservas automáticas.",
  };
}
