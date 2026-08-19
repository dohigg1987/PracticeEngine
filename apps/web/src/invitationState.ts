export type InvitationStatus = "ACTIVE" | "EXPIRED";

export function invitationStatus(
  expiresAt: string,
  now: number = Date.now(),
): InvitationStatus {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now ? "ACTIVE" : "EXPIRED";
}
