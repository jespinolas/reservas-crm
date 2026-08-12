import crypto from "node:crypto";

export function uuidFor(kind, sourceId) {
  const hash = crypto.createHash("sha256").update(`${kind}:${sourceId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function idFingerprint(sourceId) {
  return crypto.createHash("sha256").update(String(sourceId)).digest("hex").slice(0, 16);
}

export function timeFromMinutes(minutes) {
  const value = Number(minutes);
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const remainder = (value % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}:00`;
}

export function reservationStatus(status) {
  const normalized = String(status ?? "confirmed").toLowerCase();
  if (normalized === "cancelled") return "CANCELLED";
  if (normalized === "completed") return "COMPLETED";
  if (normalized === "no_show") return "NO_SHOW";
  return "CONFIRMED";
}
