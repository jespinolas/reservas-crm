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

