import type { BadgeProps } from "@fluentui/react-components";

export type StatusBadgeTone =
  | "positive"
  | "negative"
  | "caution"
  | "neutral"
  | "informative";

export type StatusBadgeProps = Readonly<
  Pick<BadgeProps, "appearance" | "color">
>;

const statusTones = {
  ACCEPTED: "positive",
  ACTIVE: "positive",
  APPROVED: "positive",
  AVAILABLE: "positive",
  COMPLETE: "positive",
  COMPLETED: "positive",
  CONFIGURED: "positive",
  DELIVERED: "positive",
  FILED: "positive",
  POSTED: "positive",
  READ: "positive",
  READY: "positive",
  RECONCILED: "positive",
  REVIEWED: "positive",
  SUCCEEDED: "positive",
  CANCELLED: "negative",
  CLOSED: "negative",
  DEAD_LETTER: "negative",
  ERROR: "negative",
  FAILED: "negative",
  REJECTED: "negative",
  REVOKED: "negative",
  BLOCKING: "caution",
  EXCEPTION: "caution",
  OVERDUE: "caution",
  PARTIAL: "caution",
  REAUTH_REQUIRED: "caution",
  RESTRICTED: "caution",
  SUSPENDED: "caution",
  WARNING: "caution",
  DISABLED: "neutral",
  DRAFT: "neutral",
  IN_PROGRESS: "neutral",
  NOT_CONFIGURED: "neutral",
  OPEN: "neutral",
  PENDING: "neutral",
  PREPARATION: "neutral",
  PROCESSING: "neutral",
  REQUESTED: "neutral",
  UNREAD: "neutral",
} as const satisfies Record<string, StatusBadgeTone>;

export type MappedStatus = keyof typeof statusTones;

const toneProps = {
  positive: { appearance: "tint", color: "success" },
  negative: { appearance: "tint", color: "danger" },
  caution: { appearance: "tint", color: "warning" },
  neutral: { appearance: "outline", color: "subtle" },
  informative: { appearance: "tint", color: "informative" },
} as const satisfies Record<StatusBadgeTone, StatusBadgeProps>;

function normaliseStatus(status: string): string {
  return status.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function statusBadgeProps(status: MappedStatus | string): StatusBadgeProps {
  const key = normaliseStatus(status);
  const tone = Object.prototype.hasOwnProperty.call(statusTones, key)
    ? statusTones[key as MappedStatus]
    : "informative";
  return toneProps[tone];
}
