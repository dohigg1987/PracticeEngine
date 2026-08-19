export const LIFECYCLE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  ACTIVE: ["SUSPENDED", "CLOSURE_REQUESTED"],
  SUSPENDED: ["ACTIVE", "CLOSURE_REQUESTED"],
  CLOSURE_REQUESTED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

const SECRET_CONFIGURATION_KEY = /(password|secret|token|credential|private[_-]?key)/i;

export function safeCommercialConfiguration(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_CONFIGURATION");
  const object = value as Record<string, unknown>;
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) { for (const item of current) visit(item); return; }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (SECRET_CONFIGURATION_KEY.test(key)) throw new Error("SECRET_CONFIGURATION_FORBIDDEN");
      visit(child);
    }
  };
  visit(object);
  if (new TextEncoder().encode(JSON.stringify(object)).byteLength > 16 * 1024)
    throw new Error("CONFIGURATION_TOO_LARGE");
  return object;
}
