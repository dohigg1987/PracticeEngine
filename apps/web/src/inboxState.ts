export type InboxFilter = "" | "UNREAD" | "READ";

export function inboxEmptyMessage(filter: InboxFilter): string {
  if (filter === "UNREAD") return "No unread notifications.";
  if (filter === "READ") return "No read notifications.";
  return "No notifications yet.";
}
