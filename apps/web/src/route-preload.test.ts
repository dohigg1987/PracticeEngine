import { describe, expect, it, vi } from "vitest";
import { applicationManifests } from "./application-manifests";

vi.mock("./PracticeManagement", () => ({ default: () => null }));
vi.mock("./ResourceEconomics", () => ({ default: () => null }));
vi.mock("./CrmOnboarding", () => ({ default: () => null }));

import { preloadNavigationItem } from "./route-preload";

describe("route chunk preloading", () => {
  it("preloads only the module owned by a likely sidebar destination", async () => {
    const practice = applicationManifests.find((manifest) => manifest.id === "practice")!;
    await expect(preloadNavigationItem(practice.navigation.find((item) => item.id === "practice-work")!)).resolves.toBeDefined();
    await expect(preloadNavigationItem(practice.navigation.find((item) => item.id === "practice-capacity")!)).resolves.toBeDefined();
    await expect(preloadNavigationItem(practice.navigation.find((item) => item.id === "practice-prospects")!)).resolves.toBeDefined();
  });

  it("does not manufacture a chunk preload for an eager clients route", () => {
    const practice = applicationManifests.find((manifest) => manifest.id === "practice")!;
    expect(preloadNavigationItem(practice.navigation.find((item) => item.id === "practice-clients")!)).toBeUndefined();
  });
});
