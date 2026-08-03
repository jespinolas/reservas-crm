import { describe, expect, it } from "vitest";
import {
  buildInstagramReadiness,
  instagramCallbackMessage,
} from "@/lib/instagram-readiness";

describe("Instagram readiness mapping", () => {
  it("asks the operator to connect when no account exists", () => {
    expect(buildInstagramReadiness(null)).toMatchObject({
      overall: "disconnected",
      nextAction: "connect_account",
      badgeLabel: "No conectado",
    });
  });

  it("shows waiting-for-webhook instead of generic review for pending webhook", () => {
    expect(
      buildInstagramReadiness({ status: "connected", webhookStatus: "pending" })
    ).toMatchObject({
      overall: "connected_waiting_for_webhook",
      nextAction: "send_test_dm",
      badgeLabel: "Esperando webhook",
    });
  });

  it("marks active webhook connections as live ready", () => {
    expect(
      buildInstagramReadiness({ status: "connected", webhookStatus: "active" })
    ).toMatchObject({
      overall: "live_ready",
      nextAction: "ready",
      badgeLabel: "Conectado",
    });
  });

  it("maps callback query string results to safe Spanish copy", () => {
    expect(
      instagramCallbackMessage({ mode: "connected", reason: "connected" })
    ).toMatchObject({
      variant: "success",
      message: "Instagram fue conectado correctamente.",
    });
    expect(
      instagramCallbackMessage({ mode: "failed", reason: "token_exchange_failed" })
    ).toMatchObject({
      variant: "error",
      message: "Meta rechazó el intercambio de autorización. Intenta conectar de nuevo.",
    });
  });
});

