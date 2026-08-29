import { describe, expect, it } from "vitest";
import {
  applicationManifests,
  applicationAccessAllowed,
  assertUniqueRouteOwnership,
  assertSettingsRouteIntegrity,
  availableApplications,
  canonicalPath,
  canManageSettings,
  contextualApplicationPath,
  globalSettings,
  globalSettingForPath,
  manifestForPath,
  navigationItemForPath,
  quoteBenchProposalAccessAllowed,
  suiteIdentity,
} from "./application-manifests";

describe("PracticeEngine application manifests", () => {
  it("defines PracticeEngine as the global suite brand", () => {
    expect(suiteIdentity).toEqual({ id: "practiceengine", name: "PracticeEngine", mark: "PE" });
  });
  it("owns application identity, navigation, settings and contextual actions", () => {
    expect(applicationManifests.map((app) => app.id)).toEqual(["practice", "ledgerly", "quotebench", "clarity-ie"]);
    for (const app of applicationManifests) {
      expect(app.routePrefix).toBe(`/${app.id}`);
      expect(app.entitlement).toMatch(/\.enabled$/);
      expect(app.homeRoute.startsWith(app.routePrefix)).toBe(true);
    }
  });

  it("has no duplicate route ownership", () => {
    expect(() => assertUniqueRouteOwnership()).not.toThrow();
    expect(() => assertSettingsRouteIntegrity()).not.toThrow();
  });

  it("never contaminates specialist navigation", () => {
    const ledgerly = applicationManifests.find((app) => app.id === "ledgerly")!;
    expect(ledgerly.navigation.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["Prospects", "Opportunities", "Resources", "Capacity", "Work allocation", "Time"]),
    );
    const practice = applicationManifests.find((app) => app.id === "practice")!;
    expect(practice.navigation.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["Trial balance", "Mapping", "Journals", "Reconciliations", "Working papers", "Filing"]),
    );
  });

  it("exposes six intent-led Practice destinations and keeps operational detail local", () => {
    const practice = applicationManifests.find((app) => app.id === "practice")!;
    expect(practice.navigation.filter((item) => item.primary !== false).map((item) => item.label)).toEqual([
      "Home", "Clients & CRM", "Work", "Team", "Collaboration", "Insights",
    ]);
    expect(practice.navigation.find((item) => item.id === "practice-operations")?.primary).toBe(false);
  });

  it("returns only effectively entitled, implemented applications", () => {
    expect(availableApplications({ "practice.enabled": true, "ledgerly.enabled": true, "quotebench.enabled": false }).map((app) => app.id)).toEqual(["practice", "ledgerly"]);
    expect(availableApplications({ "practice.enabled": true, "quotebench.enabled": true }).map((app) => app.id)).toEqual(["practice", "quotebench"]);
  });

  it("denies a direct application route after an effective false decision", () => {
    const ledgerly = applicationManifests.find((app) => app.id === "ledgerly")!;
    expect(applicationAccessAllowed(ledgerly, { "ledgerly.enabled": false }, true)).toBe(false);
    expect(applicationAccessAllowed(ledgerly, {}, false)).toBe(true);
  });

  it("resolves the active application and deep navigation route", () => {
    expect(manifestForPath("/practice/work/abc")?.id).toBe("practice");
    expect(navigationItemForPath("/practice/crm/opportunities/new")?.id).toBe("practice-opportunities");
    expect(navigationItemForPath("/practice/crm/opportunities/opportunity-1")?.id).toBe("practice-opportunities");
    expect(navigationItemForPath("/practice/crm/prospects/prospect-1")?.id).toBe("practice-prospects");
    expect(navigationItemForPath("/ledgerly/working-papers/wp-1")?.id).toBe("ledgerly-working-papers");
    expect(manifestForPath("/settings")).toBeUndefined();
  });

  it("keeps legacy deep links compatible through canonical redirects", () => {
    expect(canonicalPath("/clients")).toBe("/practice/clients");
    expect(canonicalPath("/mapping")).toBe("/ledgerly/mapping");
    expect(canonicalPath("/practice/clients")).toBe("/practice/clients");
  });

  it("switches application navigation while retaining stable shared context", () => {
    const practice = manifestForPath("/practice/work")!;
    const ledgerly = manifestForPath("/ledgerly/overview")!;
    expect(practice.navigation).not.toBe(ledgerly.navigation);
    expect(contextualApplicationPath(ledgerly.homeRoute, { client: "client-1", engagement: "engagement-1" }))
      .toBe("/ledgerly/overview?client=client-1&engagement=engagement-1");
  });

  it("separates global and application settings ownership", () => {
    expect(globalSettings.map((item) => item.label)).toEqual(expect.arrayContaining(["Organisation", "Users", "Security", "Subscription", "Apps & entitlements"]));
    expect(applicationManifests.find((app) => app.id === "practice")!.settings.map((item) => item.label)).toContain("Service catalogue");
    expect(applicationManifests.find((app) => app.id === "ledgerly")!.settings.map((item) => item.label)).toEqual(["Accounting configuration", "Accounts & filing"]);
    expect(globalSettings.map((item) => item.label)).not.toContain("Service catalogue");
  });

  it("requires both QuoteBench application and proposal entitlements", () => {
    expect(quoteBenchProposalAccessAllowed({ "quotebench.enabled": true, "quotebench.proposals": true }, true)).toBe(true);
    expect(quoteBenchProposalAccessAllowed({ "quotebench.enabled": true, "quotebench.proposals": false }, true)).toBe(false);
    expect(quoteBenchProposalAccessAllowed({ "quotebench.enabled": false, "quotebench.proposals": true }, true)).toBe(false);
    expect(quoteBenchProposalAccessAllowed({ "quotebench.enabled": true, "quotebench.proposals": true }, false)).toBe(false);
  });

  it("gives every advertised global settings route one distinct semantic content owner", () => {
    expect(new Set(globalSettings.map((item) => item.path)).size).toBe(globalSettings.length);
    expect(new Set(globalSettings.map((item) => item.contentKey)).size).toBe(globalSettings.length);
    for (const setting of globalSettings) expect(globalSettingForPath(setting.path)).toEqual(setting);
  });

  it("keeps Settings mutation authority separate from ordinary membership", () => {
    expect(canManageSettings("OWNER")).toBe(true);
    expect(canManageSettings("ADMIN")).toBe(true);
    expect(canManageSettings("MEMBER")).toBe(false);
    expect(canManageSettings("")).toBe(false);
  });
});
