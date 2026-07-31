import { describe, expect, it } from "vitest";
import { buildReservationIcs } from "@/server/lite/calendar";

describe("Lite calendar export", () => {
  it("exports confirmed reservation data as an ICS calendar event", () => {
    const ics = buildReservationIcs({
      businessName: "Casa Quinta",
      generatedAt: new Date("2026-07-31T12:00:00.000Z"),
      reservation: {
        id: "rsv_1",
        resource: { id: "res_1", name: "Casa 3" },
        service: { id: "rsvc_1", name: "Estadía", durationMinutes: 60 },
        contact: { id: "ct_1", name: "Ana", phone: "+595981123456" },
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-02T14:00:00.000Z"),
      },
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Estadía - Casa 3");
    expect(ics).toContain("UID:rsv_1@reservas-crm");
    expect(ics).toContain("END:VCALENDAR");
  });
});
