export type SessionResponse = {
  accessToken: string;
  expiresAt: string;
  userId: string;
  organizationId: string;
};

export type CurrentUser = {
  id: string;
  email: string;
  organizationId: string;
};

export type Contact = {
  id: string;
  organizationId: string;
  phone: string;
  name: string;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: string;
  organizationId: string;
  contactId: string;
  channel: "whatsapp" | "instagram";
  providerConversationId: string | null;
  test: boolean;
  aiEnabled: boolean;
  unreadCount: number;
};

export type Message = {
  id: string;
  organizationId: string;
  conversationId: string;
  channel: "whatsapp" | "instagram";
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  providerMessageId: string | null;
  error: string | null;
  aiGenerated: boolean;
  providerTimestamp: string | null;
  createdAt: string;
};

export type Resource = { id: string; organizationId: string; name: string; kind: string; capacity: number; active: boolean; createdAt: string; updatedAt: string };
export type BookableService = { id: string; organizationId: string; name: string; durationMinutes: number; priceAmount: number; currency: string; active: boolean; createdAt: string; updatedAt: string };
export type AvailabilitySlot = { resourceId: string; serviceId: string; startsAt: string; endsAt: string; quotedAmount: number; currency: string };
export type Hold = { id: string; organizationId: string; resourceId: string; serviceId: string; contactId: string; startsAt: string; endsAt: string; status: "ACTIVE" | "EXPIRED" | "CONFIRMED" | "CANCELLED"; expiresAt: string; idempotencyKey: string; quotedAmount: number; currency: string; createdAt: string; updatedAt: string };
export type Reservation = { id: string; organizationId: string; resourceId: string; serviceId: string; contactId: string; holdId: string | null; startsAt: string; endsAt: string; status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"; quotedAmount: number; currency: string; idempotencyKey: string | null; createdAt: string; updatedAt: string };

export class ReservasApi {
  private token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  setToken(token: string | null) {
    this.token = token;
  }

  async login(email: string, password: string) {
    return this.request<SessionResponse>("/api/v1/auth/sessions", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async me() {
    return this.request<CurrentUser>("/api/v1/auth/me");
  }

  async contacts(query = "") {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return this.request<Contact[]>(`/api/v1/contacts${suffix}`);
  }

  async conversations() {
    return this.request<Conversation[]>("/api/v1/conversations");
  }

  async messages(conversationId: string) {
    return this.request<Message[]>(`/api/v1/conversations/${conversationId}/messages`);
  }

  async sendManualReply(conversationId: string, text: string, idempotencyKey: string) {
    return this.request<Message>(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ text }),
    });
  }

  async resources() { return this.request<Resource[]>("/api/v1/resources"); }
  async services() { return this.request<BookableService[]>("/api/v1/services"); }
  async availability(resourceId: string, serviceId: string, from: string, to: string) {
    const query = new URLSearchParams({ resourceId, serviceId, from, to });
    return this.request<AvailabilitySlot[]>(`/api/v1/availability?${query}`);
  }
  async createHold(input: { resourceId: string; serviceId: string; contactId: string; startsAt: string; endsAt: string; holdMinutes?: number }, idempotencyKey: string) {
    return this.request<Hold>("/api/v1/holds", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) });
  }
  async confirmHold(holdId: string, idempotencyKey: string) { return this.request<Reservation>(`/api/v1/holds/${holdId}/confirm`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }); }
  async cancelHold(holdId: string, idempotencyKey: string) { return this.request<Hold>(`/api/v1/holds/${holdId}/cancel`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }); }
  async cancelReservation(reservationId: string, idempotencyKey: string) { return this.request<Reservation>(`/api/v1/reservations/${reservationId}/cancel`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }); }
  async reservations() { return this.request<Reservation[]>("/api/v1/reservations"); }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }
}
