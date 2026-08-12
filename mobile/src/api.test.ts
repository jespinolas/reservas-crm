import { ReservasApi } from "./api";

describe("ReservasApi", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends login and authenticated contact requests through the Core contract", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: "token", expiresAt: "2026-09-11T00:00:00Z", userId: "user", organizationId: "org" }),
    } as Response);
    const api = new ReservasApi("http://localhost:8080/");
    const session = await api.login("owner@example.com", "password-password");
    api.setToken(session.accessToken);
    await api.contacts("Ana Example");

    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/contacts?q=Ana%20Example", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });

  it("surfaces structured Core errors", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: "UNAUTHENTICATED", message: "Authentication is required" }),
    } as Response);
    await expect(new ReservasApi("http://localhost:8080").me()).rejects.toThrow("Authentication is required");
  });

  it("uses Core reservation availability and idempotent holds", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "hold-1", status: "ACTIVE" }),
    } as Response);
    const api = new ReservasApi("http://localhost:8080");
    api.setToken("token");
    await api.createHold({ resourceId: "resource", serviceId: "service", contactId: "contact", startsAt: "2026-08-17T08:00:00Z", endsAt: "2026-08-17T09:00:00Z" }, "mobile-hold-1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8080/api/v1/holds", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer token", "Idempotency-Key": "mobile-hold-1" }),
    }));
    await api.confirmHold("hold-1", "mobile-confirm-1");
    await api.cancelHold("hold-1", "mobile-cancel-hold-1");
    await api.cancelReservation("reservation-1", "mobile-cancel-reservation-1");
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/reservations/reservation-1/cancel", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token", "Idempotency-Key": "mobile-cancel-reservation-1" }),
    }));
  });
});
