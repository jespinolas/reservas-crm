import test from "node:test";
import assert from "node:assert/strict";
import { idFingerprint, reservationStatus, timeFromMinutes, uuidFor } from "./core-import-utils.mjs";

test("source IDs map to stable UUIDs with distinct entity namespaces", () => {
  const contact = uuidFor("contact", "source-123");
  assert.equal(contact, uuidFor("contact", "source-123"));
  assert.notEqual(contact, uuidFor("conversation", "source-123"));
  assert.match(contact, /^[0-9a-f-]{36}$/);
  assert.equal(idFingerprint("source-123"), idFingerprint("source-123"));
  assert.equal(idFingerprint("source-123").length, 16);
});

test("source schedule and reservation states map to Core values", () => {
  assert.equal(timeFromMinutes(0), "00:00:00");
  assert.equal(timeFromMinutes(1025), "17:05:00");
  assert.equal(reservationStatus("cancelled"), "CANCELLED");
  assert.equal(reservationStatus("completed"), "COMPLETED");
  assert.equal(reservationStatus("no_show"), "NO_SHOW");
  assert.equal(reservationStatus("active"), "CONFIRMED");
});
