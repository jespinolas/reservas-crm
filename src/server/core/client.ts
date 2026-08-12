import { getCoreApiUrl } from "./config";

export type CoreConversation = {
  id: string;
  organizationId: string;
  contactId: string;
  channel: "whatsapp" | "instagram";
  providerConversationId: string | null;
  test: boolean;
  aiEnabled: boolean;
  unreadCount: number;
};

export type CoreMessage = {
  id: string;
  organizationId: string;
  conversationId: string;
  channel: "whatsapp" | "instagram";
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  providerMessageId: string | null;
  idempotencyKey: string | null;
  error: string | null;
  aiGenerated: boolean;
  providerTimestamp: string | null;
  createdAt: string;
};

export type CoreResource = { id: string; organizationId: string; name: string; kind: string; capacity: number; active: boolean; createdAt: string; updatedAt: string };
export type CoreBookableService = { id: string; organizationId: string; name: string; durationMinutes: number; priceAmount: number; currency: string; active: boolean; createdAt: string; updatedAt: string };
export type CoreAvailabilitySlot = { resourceId: string; serviceId: string; startsAt: string; endsAt: string; quotedAmount: number; currency: string };
export type CoreHold = { id: string; organizationId: string; resourceId: string; serviceId: string; contactId: string; startsAt: string; endsAt: string; status: "ACTIVE" | "EXPIRED" | "CONFIRMED" | "CANCELLED"; expiresAt: string; idempotencyKey: string; quotedAmount: number; currency: string; createdAt: string; updatedAt: string };
export type CoreReservation = { id: string; organizationId: string; resourceId: string; serviceId: string; contactId: string; holdId: string | null; startsAt: string; endsAt: string; status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"; quotedAmount: number; currency: string; idempotencyKey: string | null; createdAt: string; updatedAt: string };
export type CoreSessionResponse = { accessToken: string; expiresAt: string; userId: string; organizationId: string };

export class CoreApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "CoreApiError";
  }
}

export class CoreApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = getCoreApiUrl(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  listConversations(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return this.request<CoreConversation[]>(`/api/v1/conversations${query}`);
  }

  listMessages(conversationId: string) {
    return this.request<CoreMessage[]>(`/api/v1/conversations/${conversationId}/messages`);
  }

  sendManualReply(conversationId: string, text: string, idempotencyKey: string) {
    return this.request<CoreMessage>(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ text }),
    });
  }

  listResources() { return this.request<CoreResource[]>("/api/v1/resources"); }
  listServices() { return this.request<CoreBookableService[]>("/api/v1/services"); }
  listAvailability(resourceId: string, serviceId: string, from: Date, to: Date) {
    const query = new URLSearchParams({ resourceId, serviceId, from: from.toISOString(), to: to.toISOString() });
    return this.request<CoreAvailabilitySlot[]>(`/api/v1/availability?${query}`);
  }
  listReservations() { return this.request<CoreReservation[]>("/api/v1/reservations"); }
  createHold(input: { resourceId: string; serviceId: string; contactId: string; startsAt: string; endsAt: string; holdMinutes?: number }, idempotencyKey: string) {
    return this.request<CoreHold>("/api/v1/holds", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) });
  }
  confirmHold(holdId: string, idempotencyKey: string) {
    return this.request<CoreReservation>(`/api/v1/holds/${holdId}/confirm`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } });
  }
  cancelHold(holdId: string, idempotencyKey: string) {
    return this.request<CoreHold>(`/api/v1/holds/${holdId}/cancel`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } });
  }
  cancelReservation(reservationId: string, idempotencyKey: string) {
    return this.request<CoreReservation>(`/api/v1/reservations/${reservationId}/cancel`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...init.headers,
      },
    });
    if (!response.ok) throw new CoreApiError(response.status, `Core API request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }
}
