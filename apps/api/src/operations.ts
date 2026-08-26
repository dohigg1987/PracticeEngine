export const SERVICE_NAME = "uk-accounts-api";

export interface HealthReport {
  status: "ok";
  service: string;
  version?: string;
}

export function healthReport(appVersion?: string): HealthReport {
  const version = appVersion?.trim();
  return {
    status: "ok",
    service: SERVICE_NAME,
    ...(version ? { version } : {}),
  };
}

export type ReadinessComponent = "database" | "artefactStorage";

export interface ReadinessReport {
  status: "ready" | "degraded";
  service: string;
  checkedAt: string;
  components: Record<ReadinessComponent, { status: "ready" | "unavailable" }>;
}

export function requestCorrelationId(value: string | null): string {
  const candidate = value?.trim() ?? "";
  return candidate.length > 0 &&
    candidate.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

export async function readinessReport(
  checks: Record<ReadinessComponent, () => Promise<void>>,
  checkedAt = new Date(),
): Promise<ReadinessReport> {
  const entries = await Promise.all(
    (Object.keys(checks) as ReadinessComponent[]).map(async (component) => {
      try {
        await checks[component]();
        return [component, { status: "ready" as const }] as const;
      } catch {
        return [component, { status: "unavailable" as const }] as const;
      }
    }),
  );
  const components = Object.fromEntries(entries) as ReadinessReport["components"];
  return {
    status: entries.every(([, item]) => item.status === "ready")
      ? "ready"
      : "degraded",
    service: SERVICE_NAME,
    checkedAt: checkedAt.toISOString(),
    components,
  };
}
