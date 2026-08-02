import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 20);

const prefixes = {
  organization: "org",
  contact: "ct",
  conversation: "cv",
  message: "msg",
  lead: "ld",
  stage: "stg",
  credentials: "cred",
  agentProfile: "agp",
  kbEntry: "kb",
  template: "tpl",
  testRun: "run",
  testCase: "case",
  businessConfiguration: "bcfg",
  resource: "res",
  reservationService: "rsvc",
  reservationServicePaymentRule: "rpay",
  resourceSchedule: "rsch",
  scheduleException: "sex",
  blackoutPeriod: "blk",
  bookingHold: "hold",
  reservation: "rsv",
  reservationStatusHistory: "rsh",
  reservationReminder: "rem",
  manualPaymentVerification: "mpv",
  manualPaymentVerificationHistory: "mpvh",
  aiBookingSettings: "aibs",
  aiBookingSession: "aibses",
  aiBookingSessionEvent: "aibevt",
  googleCalendarConnection: "gcal",
  googleCalendarSync: "gcalsync",
  resourceCalendarMapping: "rcm",
  resourceBusyBlock: "rbb",
  liteBookingRequest: "lbr",
  liteBookingRequestEvent: "lbre",
  liteAvailabilityBlock: "lab",
  liteReminderCompletion: "lrc",
  liteCustomerProfile: "lcp",
  automationOutbox: "aout",
  aiReplyAttempt: "aira",
  instagramConnection: "igconn",
  contactIdentity: "cid",
  instagramComment: "igc",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
