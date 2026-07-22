/** DTOs que viajan por la API interna (lado cliente). */

export type ConversationDto = {
  id: string;
  contact: { id: string; name: string; phone: string };
  stageName: string | null;
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  aiGenerated: boolean;
  createdAt: string;
};

export type TemplateDto = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
};

export type StageDto = {
  id: string;
  name: string;
  position: number;
  kind: "open" | "won" | "lost";
};

export type ContactDto = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  archivedAt: string | null;
};

export type ReservationListItemDto = {
  id: string;
  type: "reservation" | "hold";
  status: "confirmed" | "cancelled" | "active_hold";
  resource: { id: string; name: string };
  service: { id: string; name: string; durationMinutes: number };
  contact: { id: string; name: string; phone: string } | null;
  startsAt: string;
  endsAt: string;
  expiresAt: string | null;
};

export type ReservationListSummaryDto = {
  confirmed: number;
  cancelled: number;
  activeHolds: number;
};
