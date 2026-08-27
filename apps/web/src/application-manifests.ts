export type ApplicationId = "practice" | "ledgerly" | "quotebench" | "clarity-ie";

export const suiteIdentity = { id: "practiceengine", name: "PracticeEngine", mark: "PE" } as const;

export type WorkspacePage =
  | "engagement"
  | "clients"
  | "work"
  | "collaboration"
  | "client-portal"
  | "crm-prospects"
  | "crm-opportunities"
  | "onboarding"
  | "resources"
  | "capacity"
  | "allocation"
  | "time"
  | "portfolio"
  | "management"
  | "team"
  | "integrations"
  | "inbox"
  | "settings"
  | "practice-settings";

export type LedgerlyView =
  | "overview"
  | "data"
  | "mapping"
  | "journals"
  | "reconciliations"
  | "tasks"
  | "review"
  | "working-papers"
  | "disclosures"
  | "accounts"
  | "versions"
  | "filing"
  | "portal"
  | "history";

export type PracticeView = "work" | "reviews" | "recurring" | "operations";

export type ApplicationNavigationItem = {
  id: string;
  label: string;
  path: string;
  icon: "home" | "clients" | "work" | "people" | "document" | "open";
  page: WorkspacePage;
  ledgerlyView?: LedgerlyView;
  practiceView?: PracticeView;
  requiredEntitlement?: string;
  primary?: boolean;
};

export type ApplicationSetting = {
  id: string;
  label: string;
  path: string;
};

export type ContextualAction = {
  id: string;
  label: string;
  targetApplicationId: ApplicationId;
  sourceContext: "client" | "work" | "opportunity";
  requiresLinkedRecord: boolean;
};

export type ApplicationManifest = {
  id: ApplicationId;
  name: string;
  shortName: string;
  icon: "practice" | "ledgerly" | "quotebench" | "clarity-ie";
  routePrefix: `/${string}`;
  entitlement: string;
  homeRoute: string;
  status: "available" | "integration" | "future";
  navigation: readonly ApplicationNavigationItem[];
  settings: readonly ApplicationSetting[];
  contextualActions: readonly ContextualAction[];
  externalUrl?: string;
};

const practiceNavigation = [
  { id: "practice-home", label: "Home", path: "/practice/home", icon: "home", page: "management" },
  { id: "practice-prospects", label: "Prospects", path: "/practice/crm/prospects", icon: "people", page: "crm-prospects" },
  { id: "practice-opportunities", label: "Opportunities", path: "/practice/crm/opportunities", icon: "document", page: "crm-opportunities" },
  { id: "practice-onboarding", label: "Onboarding", path: "/practice/onboarding", icon: "document", page: "onboarding" },
  { id: "practice-clients", label: "Clients", path: "/practice/clients", icon: "clients", page: "clients" },
  { id: "practice-work", label: "Work", path: "/practice/work", icon: "work", page: "work", practiceView: "work" },
  { id: "practice-review", label: "Review", path: "/practice/review", icon: "document", page: "work", practiceView: "reviews" },
  { id: "practice-recurring", label: "Recurring work", path: "/practice/recurring-work", icon: "document", page: "work", practiceView: "recurring" },
  { id: "practice-operations", label: "Automation & operations", path: "/practice/automation", icon: "document", page: "work", practiceView: "operations" },
  { id: "practice-collaboration", label: "Client collaboration", path: "/practice/collaboration", icon: "people", page: "collaboration" },
  { id: "practice-client-portal", label: "Client portal", path: "/practice/client-portal", icon: "open", page: "client-portal", primary: false },
  { id: "practice-resources", label: "Resources", path: "/practice/resources", icon: "people", page: "resources" },
  { id: "practice-capacity", label: "Capacity", path: "/practice/capacity", icon: "document", page: "capacity" },
  { id: "practice-allocation", label: "Work allocation", path: "/practice/work-allocation", icon: "document", page: "allocation" },
  { id: "practice-time", label: "Time", path: "/practice/time", icon: "document", page: "time" },
  { id: "practice-portfolio", label: "Portfolio economics", path: "/practice/portfolio-economics", icon: "clients", page: "portfolio" },
] as const satisfies readonly ApplicationNavigationItem[];

const ledgerlyNavigation = [
  { id: "ledgerly-overview", label: "Overview", path: "/ledgerly/overview", icon: "home", page: "engagement", ledgerlyView: "overview" },
  { id: "ledgerly-engagements", label: "Accounting engagements", path: "/ledgerly/engagements", icon: "clients", page: "engagement", ledgerlyView: "overview" },
  { id: "ledgerly-trial-balance", label: "Trial balance", path: "/ledgerly/trial-balance", icon: "document", page: "engagement", ledgerlyView: "data" },
  { id: "ledgerly-mapping", label: "Mapping", path: "/ledgerly/mapping", icon: "document", page: "engagement", ledgerlyView: "mapping" },
  { id: "ledgerly-journals", label: "Journals", path: "/ledgerly/journals", icon: "document", page: "engagement", ledgerlyView: "journals" },
  { id: "ledgerly-reconciliations", label: "Reconciliations", path: "/ledgerly/reconciliations", icon: "document", page: "engagement", ledgerlyView: "reconciliations" },
  { id: "ledgerly-working-papers", label: "Working papers", path: "/ledgerly/working-papers", icon: "document", page: "engagement", ledgerlyView: "working-papers" },
  { id: "ledgerly-accounts", label: "Accounts", path: "/ledgerly/accounts", icon: "document", page: "engagement", ledgerlyView: "accounts" },
  { id: "ledgerly-artefacts", label: "Artefacts", path: "/ledgerly/artefacts", icon: "document", page: "engagement", ledgerlyView: "versions" },
  { id: "ledgerly-filing", label: "Filing", path: "/ledgerly/filing", icon: "open", page: "engagement", ledgerlyView: "filing" },
  { id: "ledgerly-tasks", label: "Technical tasks", path: "/ledgerly/tasks", icon: "document", page: "engagement", ledgerlyView: "tasks", primary: false },
  { id: "ledgerly-review", label: "Technical review", path: "/ledgerly/review", icon: "document", page: "engagement", ledgerlyView: "review", primary: false },
  { id: "ledgerly-disclosures", label: "Disclosures", path: "/ledgerly/disclosures", icon: "document", page: "engagement", ledgerlyView: "disclosures", primary: false },
  { id: "ledgerly-history", label: "History", path: "/ledgerly/history", icon: "document", page: "engagement", ledgerlyView: "history", primary: false },
  { id: "ledgerly-portal-evidence", label: "Portal evidence", path: "/ledgerly/portal", icon: "open", page: "engagement", ledgerlyView: "portal", primary: false },
  { id: "ledgerly-integrations", label: "Imports and integrations", path: "/ledgerly/integrations", icon: "document", page: "integrations", primary: false },
] as const satisfies readonly ApplicationNavigationItem[];

export const applicationManifests: readonly ApplicationManifest[] = [
  {
    id: "practice",
    name: "Practice Management",
    shortName: "Practice",
    icon: "practice",
    routePrefix: "/practice",
    entitlement: "practice.enabled",
    homeRoute: "/practice/home",
    status: "available",
    navigation: practiceNavigation,
    settings: [
      { id: "practice-services", label: "Service catalogue", path: "/practice/settings/services" },
      { id: "practice-templates", label: "Work templates", path: "/practice/settings/work-templates" },
      { id: "practice-automation", label: "Workflow & automation", path: "/practice/settings/automation" },
      { id: "practice-resources", label: "Resources & economics", path: "/practice/settings/resources" },
      { id: "practice-collaboration", label: "Portal & collaboration", path: "/practice/settings/collaboration" },
    ],
    contextualActions: [
      { id: "open-ledgerly", label: "Open in Ledgerly", targetApplicationId: "ledgerly", sourceContext: "work", requiresLinkedRecord: true },
      { id: "open-quotebench", label: "Open in QuoteBench", targetApplicationId: "quotebench", sourceContext: "opportunity", requiresLinkedRecord: false },
    ],
  },
  {
    id: "ledgerly",
    name: "Ledgerly",
    shortName: "Ledgerly",
    icon: "ledgerly",
    routePrefix: "/ledgerly",
    entitlement: "ledgerly.enabled",
    homeRoute: "/ledgerly/overview",
    status: "available",
    navigation: ledgerlyNavigation,
    settings: [
      { id: "ledgerly-accounting", label: "Accounting configuration", path: "/ledgerly/settings/accounting" },
      { id: "ledgerly-reporting", label: "Accounts & filing", path: "/ledgerly/settings/accounts" },
    ],
    contextualActions: [],
  },
  {
    id: "quotebench",
    name: "QuoteBench",
    shortName: "QuoteBench",
    icon: "quotebench",
    routePrefix: "/quotebench",
    entitlement: "quotebench.enabled",
    homeRoute: "/quotebench",
    status: "integration",
    navigation: [],
    settings: [{ id: "quotebench-proposals", label: "Proposal & pricing configuration", path: "/quotebench/settings" }],
    contextualActions: [],
    externalUrl: import.meta.env.VITE_QUOTEBENCH_URL?.trim() || undefined,
  },
  {
    id: "clarity-ie",
    name: "Clarity IE",
    shortName: "Clarity IE",
    icon: "clarity-ie",
    routePrefix: "/clarity-ie",
    entitlement: "clarity-ie.enabled",
    homeRoute: "/clarity-ie",
    status: "future",
    navigation: [],
    settings: [],
    contextualActions: [],
  },
] as const;

export const globalSettings = [
  "Organisation",
  "Users",
  "Teams",
  "Security",
  "Branding",
  "Integrations",
  "Subscription",
  "Apps & entitlements",
  "Notifications",
] as const;

export function manifestForPath(pathname: string): ApplicationManifest | undefined {
  return applicationManifests.find(
    (manifest) => pathname === manifest.routePrefix || pathname.startsWith(`${manifest.routePrefix}/`),
  );
}

export function navigationItemForPath(pathname: string): ApplicationNavigationItem | undefined {
  const manifest = manifestForPath(pathname);
  if (!manifest) return undefined;
  return [...manifest.navigation]
    .sort((left, right) => right.path.length - left.path.length)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
}

export function availableApplications(
  decisions: Readonly<Record<string, boolean>>,
): ApplicationManifest[] {
  return applicationManifests.filter(
    (manifest) => manifest.status !== "future" && decisions[manifest.entitlement] === true,
  );
}

export function applicationAccessAllowed(
  manifest: ApplicationManifest | undefined,
  decisions: Readonly<Record<string, boolean>>,
  decisionsLoaded: boolean,
): boolean {
  return !manifest || !decisionsLoaded || decisions[manifest.entitlement] === true;
}

export function contextualApplicationPath(
  path: string,
  context: Readonly<Record<string, string | undefined>>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(context)) if (value) query.set(key, value);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function assertUniqueRouteOwnership(manifests: readonly ApplicationManifest[] = applicationManifests) {
  const owners = new Map<string, ApplicationId>();
  for (const manifest of manifests) {
    for (const path of [manifest.homeRoute, ...manifest.navigation.map((item) => item.path), ...manifest.settings.map((item) => item.path)]) {
      const owner = owners.get(path);
      if (owner && owner !== manifest.id) throw new Error(`Route ${path} is owned by both ${owner} and ${manifest.id}`);
      owners.set(path, manifest.id);
    }
  }
  return owners;
}

export const legacyRouteRedirects: Readonly<Record<string, string>> = {
  "/": "/ledgerly/overview",
  "/clients": "/practice/clients",
  "/work": "/practice/work",
  "/crm/prospects": "/practice/crm/prospects",
  "/crm/opportunities": "/practice/crm/opportunities",
  "/onboarding": "/practice/onboarding",
  "/resources": "/practice/resources",
  "/capacity": "/practice/capacity",
  "/allocation": "/practice/work-allocation",
  "/time": "/practice/time",
  "/portfolio": "/practice/portfolio-economics",
  "/management": "/practice/home",
  "/engagement": "/ledgerly/overview",
  "/trial-balance": "/ledgerly/trial-balance",
  "/mapping": "/ledgerly/mapping",
  "/journals": "/ledgerly/journals",
  "/reconciliations": "/ledgerly/reconciliations",
  "/working-papers": "/ledgerly/working-papers",
  "/accounts": "/ledgerly/accounts",
  "/filing": "/ledgerly/filing",
  "/settings": "/settings",
};

export function canonicalPath(pathname: string): string {
  return legacyRouteRedirects[pathname] ?? pathname;
}
