import type { ApplicationNavigationItem, WorkspacePage } from "./application-manifests";

export const importEngagementProduction = () => import("./EngagementProduction");
export const importCommercialWorkspace = () => import("./CommercialWorkspace");
export const importPracticeManagement = () => import("./PracticeManagement");
export const importResourceEconomics = () => import("./ResourceEconomics");
export const importCrmOnboarding = () => import("./CrmOnboarding");
export const importClientCollaboration = () => import("./ClientCollaboration");

type RouteImporter = () => Promise<unknown>;

const importersByPage: Partial<Record<WorkspacePage, RouteImporter>> = {
  engagement: importEngagementProduction,
  integrations: importCommercialWorkspace,
  inbox: importCommercialWorkspace,
  settings: importCommercialWorkspace,
  work: importPracticeManagement,
  "practice-settings": importPracticeManagement,
  resources: importResourceEconomics,
  capacity: importResourceEconomics,
  allocation: importResourceEconomics,
  time: importResourceEconomics,
  portfolio: importResourceEconomics,
  management: importResourceEconomics,
  "crm-prospects": importCrmOnboarding,
  "crm-opportunities": importCrmOnboarding,
  onboarding: importCrmOnboarding,
  collaboration: importClientCollaboration,
  "client-portal": importClientCollaboration,
};

export function preloadNavigationItem(item: ApplicationNavigationItem): Promise<unknown> | undefined {
  return importersByPage[item.page]?.();
}

export function preloadPrimaryPracticeRoutes(): void {
  const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 500));
  schedule(() => {
    void importPracticeManagement();
    void importCrmOnboarding();
    void importResourceEconomics();
  }, { timeout: 2_000 });
}
