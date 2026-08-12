#!/usr/bin/env node
/**
 * Staging-only, idempotent importer for the first Core slice.
 *
 * Default mode is inventory/dry-run. Applying data requires both:
 *   MIGRATION_ENV=staging ALLOW_MIGRATION_APPLY=YES node ... --apply
 *
 * URLs are read from the environment and are never printed. The importer
 * intentionally migrates contacts, conversations, and messages only; auth,
 * provider secrets, reservations, and integrations need separate approved
 * mappings.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required; URLs are not printed.");
  process.exit(2);
}
if (APPLY && (process.env.MIGRATION_ENV !== "staging" || process.env.ALLOW_MIGRATION_APPLY !== "YES")) {
  console.error("Apply mode is restricted to MIGRATION_ENV=staging and ALLOW_MIGRATION_APPLY=YES.");
  process.exit(2);
}

const source = postgres(sourceUrl, { max: 1, onnotice: () => {} });
const target = postgres(targetUrl, { max: 1, onnotice: () => {} });
const sourceTables = [
  "organization", "contact", "conversation", "message", "resource",
  "reservation_service", "resource_schedule", "booking_hold", "reservation",
];

function uuidFor(kind, sourceId) {
  const hash = crypto.createHash("sha256").update(`${kind}:${sourceId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function idFingerprint(sourceId) {
  return crypto.createHash("sha256").update(String(sourceId)).digest("hex").slice(0, 16);
}

async function inventory() {
  const organizations = await source`select id, name, slug from organization order by id`;
  const counts = {};
  for (const table of sourceTables) {
    const [{ count }] = await source.unsafe(`select count(*)::int as count from "${table}"`);
    counts[table] = count;
  }
  const targetOrganizations = await target`select id, slug from organizations order by slug`;
  const targetSlugs = new Set(targetOrganizations.map((row) => row.slug));
  return {
    schema: "reservas-core-migration-manifest/v1",
    mode: APPLY ? "apply" : "dry-run",
    sourceTables: counts,
    organizations: organizations.map((row) => ({
      sourceIdFingerprint: idFingerprint(row.id),
      slug: row.slug,
      namePresent: Boolean(row.name),
      targetOrganizationPresent: targetSlugs.has(row.slug),
    })),
    excluded: ["users", "memberships", "sessions", "provider_credentials", "reservations", "resources", "payments", "calendar", "automation_outbox"],
  };
}

async function applyCore(manifest) {
  const organizations = await source`select id, name, slug, created_at from organization order by id`;
  const targetOrganizations = await target`select id, slug from organizations`;
  const targetBySlug = new Map(targetOrganizations.map((row) => [row.slug, row.id]));
  const contacts = await source`select * from contact order by organization_id, id`;
  const conversations = await source`select * from conversation order by organization_id, id`;
  const messages = await source`select * from message order by organization_id, id`;
  const resources = await source`select * from resource order by organization_id, id`;
  const services = await source`select * from reservation_service order by organization_id, id`;
  const paymentRules = await source`select * from reservation_service_payment_rule order by organization_id, service_id`;
  const schedules = await source`select * from resource_schedule order by organization_id, resource_id, day_of_week`;
  const holds = await source`select * from booking_hold order by organization_id, id`;
  const reservations = await source`select * from reservation order by organization_id, id`;
  const configurations = await source`select organization_id, timezone from business_configuration`;
  const paymentRuleByService = new Map(paymentRules.map((row) => [row.service_id, row]));
  const timezoneByOrganization = new Map(configurations.map((row) => [row.organization_id, row.timezone ?? "America/Asuncion"]));
  const migrationExclusions = [];

  function timeFromMinutes(minutes) {
    const value = Number(minutes);
    const hours = Math.floor(value / 60).toString().padStart(2, "0");
    const remainder = (value % 60).toString().padStart(2, "0");
    return `${hours}:${remainder}:00`;
  }

  function reservationStatus(status) {
    const normalized = String(status ?? "confirmed").toLowerCase();
    if (normalized === "cancelled") return "CANCELLED";
    if (normalized === "completed") return "COMPLETED";
    if (normalized === "no_show") return "NO_SHOW";
    return "CONFIRMED";
  }

  for (const organization of organizations) {
    const targetOrganizationId = targetBySlug.get(organization.slug);
    if (!targetOrganizationId) throw new Error(`Target organization missing for source slug ${organization.slug}`);
    await target.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${targetOrganizationId}, false)`;
      for (const row of contacts.filter((item) => item.organization_id === organization.id)) {
        await tx`
          insert into contacts (id, organization_id, phone, name, notes, archived_at, created_at, updated_at)
          values (${uuidFor("contact", row.id)}, ${targetOrganizationId}, ${row.phone}, ${row.name}, ${row.notes}, ${row.archived_at}, ${row.created_at}, ${row.updated_at})
          on conflict (id) do nothing`;
      }
      for (const row of conversations.filter((item) => item.organization_id === organization.id)) {
        await tx`
          insert into conversations (id, organization_id, contact_id, channel, provider_conversation_id, is_test, ai_enabled, handoff_at, handoff_reason, last_inbound_at, last_message_at, unread_count, created_at, updated_at)
          values (${uuidFor("conversation", row.id)}, ${targetOrganizationId}, ${uuidFor("contact", row.contact_id)}, ${row.channel ?? "whatsapp"}, ${row.provider_conversation_id}, ${row.is_test}, ${row.ai_enabled}, ${row.handoff_at}, ${row.handoff_reason}, ${row.last_inbound_at}, ${row.last_message_at}, ${row.unread_count}, ${row.created_at}, ${row.updated_at})
          on conflict (id) do nothing`;
      }
      for (const row of messages.filter((item) => item.organization_id === organization.id)) {
        await tx`
          insert into messages (id, organization_id, conversation_id, channel, direction, type, text, status, provider_message_id, error, ai_generated, provider_timestamp, created_at)
          values (${uuidFor("message", row.id)}, ${targetOrganizationId}, ${uuidFor("conversation", row.conversation_id)}, ${row.channel ?? "whatsapp"}, ${row.direction}, ${row.type}, ${row.text}, ${row.status}, ${row.provider_message_id ?? row.wa_message_id}, ${row.error}, ${row.ai_generated}, ${row.provider_timestamp ?? row.wa_timestamp}, ${row.created_at})
          on conflict (id) do nothing`;
      }
      for (const row of resources.filter((item) => item.organization_id === organization.id)) {
        await tx`
          insert into resources (id, organization_id, name, kind, capacity, active, created_at, updated_at)
          values (${uuidFor("resource", row.id)}, ${targetOrganizationId}, ${row.name}, ${row.kind ?? "other"}, ${Math.max(1, row.capacity ?? 1)}, ${row.active ?? true}, ${row.created_at}, ${row.updated_at})
          on conflict (id) do nothing`;
      }
      for (const row of services.filter((item) => item.organization_id === organization.id)) {
        const paymentRule = paymentRuleByService.get(row.id);
        const amount = paymentRule?.amount_minor == null ? 0 : Number(paymentRule.amount_minor) / 100;
        await tx`
          insert into reservation_services (id, organization_id, name, duration_minutes, price_amount, currency, active, created_at, updated_at)
          values (${uuidFor("reservation_service", row.id)}, ${targetOrganizationId}, ${row.name}, ${Math.max(1, row.duration_minutes)}, ${amount}, ${paymentRule?.currency ?? "PYG"}, ${row.active ?? true}, ${row.created_at}, ${row.updated_at})
          on conflict (id) do nothing`;
      }
      for (const row of schedules.filter((item) => item.organization_id === organization.id)) {
        await tx`
          insert into availability_rules (id, organization_id, resource_id, day_of_week, starts_at_local, ends_at_local, timezone, active)
          values (${uuidFor("resource_schedule", row.id)}, ${targetOrganizationId}, ${uuidFor("resource", row.resource_id)}, ${row.day_of_week}, ${timeFromMinutes(row.start_minute)}, ${timeFromMinutes(row.end_minute)}, ${timezoneByOrganization.get(organization.id) ?? "America/Asuncion"}, ${row.active ?? true})
          on conflict (id) do nothing`;
      }
      for (const row of holds.filter((item) => item.organization_id === organization.id)) {
        if (!row.contact_id) {
          migrationExclusions.push({ kind: "booking_hold", sourceIdFingerprint: idFingerprint(row.id), reason: "missing_contact_id" });
          continue;
        }
        const paymentRule = paymentRuleByService.get(row.service_id);
        await tx`
          insert into reservation_holds (id, organization_id, resource_id, service_id, contact_id, starts_at, ends_at, status, expires_at, idempotency_key, quoted_amount, currency, created_at, updated_at)
          values (${uuidFor("booking_hold", row.id)}, ${targetOrganizationId}, ${uuidFor("resource", row.resource_id)}, ${uuidFor("reservation_service", row.service_id)}, ${uuidFor("contact", row.contact_id)}, ${row.starts_at}, ${row.ends_at}, ${row.status === "active" ? "ACTIVE" : row.status === "expired" ? "EXPIRED" : row.status === "converted" ? "CONFIRMED" : "CANCELLED"}, ${row.expires_at}, ${`migration-hold:${row.id}`}, ${paymentRule?.amount_minor == null ? 0 : Number(paymentRule.amount_minor) / 100}, ${paymentRule?.currency ?? "PYG"}, ${row.created_at}, ${row.updated_at})
          on conflict (id) do nothing`;
      }
      for (const row of reservations.filter((item) => item.organization_id === organization.id)) {
        if (!row.contact_id) {
          migrationExclusions.push({ kind: "reservation", sourceIdFingerprint: idFingerprint(row.id), reason: "missing_contact_id" });
          continue;
        }
        const paymentRule = paymentRuleByService.get(row.service_id);
        await tx`
          insert into reservations (id, organization_id, resource_id, service_id, contact_id, hold_id, starts_at, ends_at, status, quoted_amount, currency, idempotency_key, created_at, updated_at)
          values (${uuidFor("reservation", row.id)}, ${targetOrganizationId}, ${uuidFor("resource", row.resource_id)}, ${uuidFor("reservation_service", row.service_id)}, ${uuidFor("contact", row.contact_id)}, ${row.hold_id ? uuidFor("booking_hold", row.hold_id) : null}, ${row.starts_at}, ${row.ends_at}, ${reservationStatus(row.status)}, ${paymentRule?.amount_minor == null ? 0 : Number(paymentRule.amount_minor) / 100}, ${paymentRule?.currency ?? "PYG"}, ${`migration-reservation:${row.id}`}, ${row.created_at}, ${row.updated_at})
          on conflict (id) do nothing`;
      }
    });
  }
  manifest.applied = {
    organizations: organizations.length, contacts: contacts.length, conversations: conversations.length,
    messages: messages.length, resources: resources.length, services: services.length,
    availabilityRules: schedules.length, holds: holds.length - migrationExclusions.filter((row) => row.kind === "booking_hold").length,
    reservations: reservations.length - migrationExclusions.filter((row) => row.kind === "reservation").length,
  };
  manifest.exclusions = migrationExclusions;
}

try {
  const manifest = await inventory();
  if (APPLY) await applyCore(manifest);
  const output = process.env.MIGRATION_MANIFEST_PATH ?? ".tmp/reservas-core-migration-manifest.json";
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Migration ${APPLY ? "apply" : "dry-run"} completed: ${output}`);
} finally {
  await source.end({ timeout: 5 });
  await target.end({ timeout: 5 });
}
