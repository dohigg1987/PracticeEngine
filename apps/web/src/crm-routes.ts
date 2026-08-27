export const crmRoutes = {
  prospects: "/practice/crm/prospects",
  opportunities: "/practice/crm/opportunities",
} as const;

export type CrmRoute =
  | { view: "prospects"; mode: "list" }
  | { view: "prospects"; mode: "detail"; id: string }
  | { view: "opportunities"; mode: "list" }
  | { view: "opportunities"; mode: "create"; prospectId?: string }
  | { view: "opportunities"; mode: "detail"; id: string };

function recordPath(base: string, id: string): string {
  return `${base}/${encodeURIComponent(id)}`;
}

function decodeRouteId(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.trim() ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function prospectPath(id: string): string {
  return recordPath(crmRoutes.prospects, id);
}

export function opportunityPath(id: string): string {
  return recordPath(crmRoutes.opportunities, id);
}

export function newOpportunityPath(prospectId?: string): string {
  const path = `${crmRoutes.opportunities}/new`;
  return prospectId
    ? `${path}?${new URLSearchParams({ prospect: prospectId }).toString()}`
    : path;
}

export function parseCrmRoute(pathname: string, search = ""): CrmRoute | undefined {
  if (pathname === crmRoutes.prospects) return { view: "prospects", mode: "list" };
  if (pathname === crmRoutes.opportunities) return { view: "opportunities", mode: "list" };

  const prospectMatch = pathname.match(/^\/practice\/crm\/prospects\/([^/]+)$/);
  if (prospectMatch) {
    const id = decodeRouteId(prospectMatch[1]);
    return id ? { view: "prospects", mode: "detail", id } : undefined;
  }

  if (pathname === `${crmRoutes.opportunities}/new`) {
    const prospectId = new URLSearchParams(search).get("prospect")?.trim() || undefined;
    return { view: "opportunities", mode: "create", prospectId };
  }

  const opportunityMatch = pathname.match(/^\/practice\/crm\/opportunities\/([^/]+)$/);
  if (opportunityMatch) {
    const id = decodeRouteId(opportunityMatch[1]);
    return id && id !== "new"
      ? { view: "opportunities", mode: "detail", id }
      : undefined;
  }

  return undefined;
}
