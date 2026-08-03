export type InstagramAccountStatus = {
  status: string;
  webhookStatus: string;
};

export type InstagramReadiness = {
  overall:
    | "disconnected"
    | "connected_waiting_for_webhook"
    | "ready_for_testing"
    | "live_ready"
    | "action_required"
    | "reconnect_required";
  nextAction:
    | "connect_account"
    | "reconnect_account"
    | "configure_meta_webhook"
    | "send_test_dm"
    | "ready";
  primaryLabel: string;
  badgeLabel: string;
  badgeVariant: "success" | "warning" | "destructive" | "secondary";
  operatorMessage: string;
};

export type InstagramChecklistItem = {
  id:
    | "account_connected"
    | "meta_webhook_configured"
    | "signature_configured"
    | "first_event_received"
    | "test_dm_visible"
    | "comments_ready"
    | "app_review";
  status: "done" | "pending" | "action_required" | "failed" | "not_applicable";
  label: string;
  description: string;
};

export function buildInstagramReadiness(
  account: InstagramAccountStatus | null
): InstagramReadiness {
  if (!account) {
    return {
      overall: "disconnected",
      nextAction: "connect_account",
      primaryLabel: "Conectar Instagram",
      badgeLabel: "No conectado",
      badgeVariant: "secondary",
      operatorMessage: "Conecta una cuenta profesional de Instagram.",
    };
  }

  if (account.status === "reconnect_required") {
    return {
      overall: "reconnect_required",
      nextAction: "reconnect_account",
      primaryLabel: "Reconectar Instagram",
      badgeLabel: "Reconectar",
      badgeVariant: "destructive",
      operatorMessage: "La cuenta requiere reconexión para renovar permisos.",
    };
  }

  if (account.status !== "connected") {
    return {
      overall: "action_required",
      nextAction: "reconnect_account",
      primaryLabel: "Revisar conexión",
      badgeLabel: "Acción requerida",
      badgeVariant: "warning",
      operatorMessage: "Instagram no está listo. Revisa la conexión de la cuenta.",
    };
  }

  if (account.webhookStatus === "active") {
    return {
      overall: "live_ready",
      nextAction: "ready",
      primaryLabel: "Listo",
      badgeLabel: "Conectado",
      badgeVariant: "success",
      operatorMessage: "Instagram está conectado y listo para uso.",
    };
  }

  if (account.webhookStatus === "failed" || account.webhookStatus === "invalid_signature") {
    return {
      overall: "action_required",
      nextAction: "configure_meta_webhook",
      primaryLabel: "Revisar webhook",
      badgeLabel: "Webhook con error",
      badgeVariant: "destructive",
      operatorMessage: "Configura el webhook en Meta y verifica el token.",
    };
  }

  return {
    overall: "connected_waiting_for_webhook",
    nextAction: "send_test_dm",
    primaryLabel: "Enviar DM de prueba",
    badgeLabel: "Esperando webhook",
    badgeVariant: "warning",
    operatorMessage:
      "Instagram está conectado. Envía un DM desde otra cuenta autorizada para confirmar la bandeja.",
  };
}

export function buildInstagramChecklist(input: {
  account: InstagramAccountStatus | null;
  webhookConfigured?: boolean;
  signatureConfigured?: boolean;
}): InstagramChecklistItem[] {
  const connected = input.account?.status === "connected";
  const webhookActive = connected && input.account?.webhookStatus === "active";
  const webhookFailed =
    input.account?.webhookStatus === "failed" ||
    input.account?.webhookStatus === "invalid_signature";

  return [
    {
      id: "account_connected",
      status: connected ? "done" : "action_required",
      label: "Cuenta conectada",
      description: connected
        ? "La cuenta profesional de Instagram está vinculada al CRM."
        : "Conecta una cuenta profesional desde este panel.",
    },
    {
      id: "meta_webhook_configured",
      status: input.webhookConfigured === false ? "action_required" : "done",
      label: "Webhook configurado en Meta",
      description:
        input.webhookConfigured === false
          ? "Configura la URL de webhook y verifica el token en Meta."
          : "La configuración de webhook del servidor está disponible.",
    },
    {
      id: "signature_configured",
      status: input.signatureConfigured === false ? "action_required" : "done",
      label: "Firma de webhook configurada",
      description:
        input.signatureConfigured === false
          ? "Falta la clave de app para validar firmas de Meta."
          : "El servidor puede validar firmas de webhook.",
    },
    {
      id: "first_event_received",
      status: webhookActive ? "done" : webhookFailed ? "failed" : "pending",
      label: "Primer evento recibido",
      description: webhookActive
        ? "El CRM ya recibió al menos un evento válido de Instagram."
        : webhookFailed
          ? "Llegó un evento, pero falló la validación."
          : "Envía un DM de prueba desde otra cuenta autorizada.",
    },
    {
      id: "test_dm_visible",
      status: webhookActive ? "done" : "pending",
      label: "DM de prueba visible en bandeja",
      description: webhookActive
        ? "La bandeja puede recibir eventos de Instagram."
        : "Después del primer webhook válido, revisa la bandeja de Instagram.",
    },
    {
      id: "comments_ready",
      status: connected ? "pending" : "not_applicable",
      label: "Comentarios recibidos o prueba pendiente",
      description: connected
        ? "Crea o usa un comentario de prueba para validar el workspace de comentarios."
        : "Disponible después de conectar Instagram.",
    },
    {
      id: "app_review",
      status: "pending",
      label: "Aprobación de Meta / modo desarrollo",
      description:
        "En modo desarrollo, prueba con cuentas autorizadas. Para cuentas externas falta App Review.",
    },
  ];
}

export function instagramCallbackMessage(input: {
  mode: string | null;
  reason: string | null;
}): { variant: "success" | "warning" | "error"; message: string } | null {
  if (!input.mode) return null;
  if (input.mode === "connected") {
    return { variant: "success", message: "Instagram fue conectado correctamente." };
  }
  if (input.mode === "retry") {
    return {
      variant: "warning",
      message: "Instagram respondió con una falla temporal. Intenta conectar de nuevo.",
    };
  }
  if (input.mode === "failed") {
    const reason = input.reason ?? "unknown";
    const message =
      reason === "authorization_denied"
        ? "La autorización fue cancelada o rechazada en Meta."
        : reason === "crm_provisioning_failed"
          ? "Instagram se conectó en la plataforma, pero falta sincronizarlo con el CRM."
          : reason === "token_exchange_failed"
            ? "Meta rechazó el intercambio de autorización. Intenta conectar de nuevo."
            : "No se pudo completar la conexión con Instagram.";
    return { variant: "error", message };
  }
  return null;
}
