export type Engagement = { id: string; legal_name: string; period_start: string; period_end: string; framework: string; sector_profile: string; status: string; version: number };
export type TrialBalanceLine = { source_account_id: string; account_code: string; account_name: string; debit: string | number; credit: string | number; canonical_account_id: string | null; canonical_code: string | null; canonical_name: string | null; report_line: string | null };
export type ReportLine = { code: string; caption: string; statement_code: string; display_order: number; balance: string | number; canonical_codes: string[]; source_account_ids: string[] };
export type CanonicalAccount = { id: string; taxonomy_version: string; canonical_code: string; name: string; report_line: string; normal_balance: string };
export type AuditEvent = { event_id: string; occurred_at_utc: string; actor_id: string; event_type: string; object_type: string; object_id: string; reason: string | null; correlation_id: string; metadata: Record<string, unknown> | null; event_hash: string };
export type ApiContext = { tenantId: string; actorId: string };
export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, context: ApiContext, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...init, headers: { "x-tenant-id": context.tenantId, "x-actor-id": context.actorId, ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers } });
  } catch { throw new ApiError(0, "The accounts service could not be reached. Check the API address and try again.", "OFFLINE"); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = payload?.error; throw new ApiError(response.status, error?.message ?? `Request failed (${response.status})`, error?.code); }
  return payload as T;
}

export const api = {
  engagements: (context: ApiContext) => request<{ items: Engagement[] }>("/v1/engagements", context),
  canonicalAccounts: (context: ApiContext) => request<{ items: CanonicalAccount[] }>("/v1/canonical-accounts?taxonomyVersion=UK-CANONICAL-2026", context),
  trialBalance: (context: ApiContext, id: string) => request<{ items: TrialBalanceLine[] }>(`/v1/engagements/${encodeURIComponent(id)}/trial-balance`, context),
  history: (context: ApiContext, id: string) => request<{ items: AuditEvent[] }>(`/v1/engagements/${encodeURIComponent(id)}/history`, context),
  report: (context: ApiContext, id: string) => request<{ balanced: boolean; fullyMapped: boolean; lines: ReportLine[] }>(`/v1/engagements/${encodeURIComponent(id)}/report`, context),
  importTrialBalance: (context: ApiContext, id: string, file: File) => { const body = new FormData(); body.append("file", file); return request<{ item: { id: string; trial_balance_id: string; snapshot_id: string; version_no: number; record_count: number } }>(`/v1/engagements/${encodeURIComponent(id)}/imports`, context, { method: "POST", body }); },
  updateMapping: (context: ApiContext, id: string, sourceAccountId: string, canonicalAccountId: string) => request<{ item: unknown }>(`/v1/engagements/${encodeURIComponent(id)}/mappings`, context, { method: "POST", body: JSON.stringify({ sourceAccountId, canonicalAccountId, reason: "Mapped in accounts workspace" }) }),
};
