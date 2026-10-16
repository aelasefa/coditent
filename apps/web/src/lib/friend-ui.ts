import type { ConversationSummary, FriendRelationshipState } from "./types";

export type FriendAction = "REQUEST" | "ACCEPT" | "MESSAGE" | "PENDING" | "BLOCKED";

export function friendActionFor(
  relationship: FriendRelationshipState,
  hasIncomingRequest: boolean,
): FriendAction {
  if (relationship === "NONE") return "REQUEST";
  if (relationship === "PENDING_RECEIVED" && hasIncomingRequest) return "ACCEPT";
  if (relationship === "ACCEPTED") return "MESSAGE";
  if (relationship === "BLOCKED") return "BLOCKED";
  return "PENDING";
}

export type InboxFilter = "all" | "recruitment" | "friend";

export type InboxItem = {
  href: string;
  kind: Exclude<InboxFilter, "all">;
  name: string;
  avatar?: string | null;
  context: string;
  detail: string;
  preview: string;
  date?: string | null;
  stage?: string;
  badge: "Friend" | "Recruiter" | "Candidate";
  unreadCount: number;
};

function dateValue(iso?: string | null): number {
  const value = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(value) ? 0 : value;
}

export function mapCombinedInbox(items: ConversationSummary[]): InboxItem[] {
  return items.map((item): InboxItem => ({
    href: item.href,
    kind: item.conversation_type === "FRIEND" ? "friend" : "recruitment",
    name: item.peer?.full_name ?? (item.conversation_type === "FRIEND" ? "Friend" : item.badge),
    avatar: item.peer?.avatar_url,
    context: item.context,
    detail: item.detail,
    preview: item.last_message || "No messages yet",
    date: item.last_at,
    stage: item.status ?? undefined,
    badge: item.badge,
    unreadCount: item.unread_count,
  })).sort((left, right) => dateValue(right.date) - dateValue(left.date));
}

export function filterInbox(items: InboxItem[], filter: InboxFilter, search: string): InboxItem[] {
  const term = search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false;
    return !term || [item.name, item.context, item.detail, item.preview, item.badge]
      .some((part) => part.toLocaleLowerCase().includes(term));
  });
}
