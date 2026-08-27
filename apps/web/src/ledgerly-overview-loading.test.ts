// @ts-expect-error The web build intentionally excludes Node types; Vitest supplies this test-only module.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const app = await readFile(new URL("./App.tsx", import.meta.url), "utf8");

describe("Ledgerly overview request plan", () => {
  it("can begin a deep-linked overview request before the engagement list returns", () => {
    expect(app).toMatch(
      /useState\(\s*\(\) => new URLSearchParams\(window\.location\.search\)\.get\("engagement"\)/,
    );
  });

  it("loads dashboard and filing state without redundant operational lists", () => {
    const operationLoader = app.slice(
      app.indexOf("const loadOperations = useCallback"),
      app.indexOf("useEffect(() => {\n    loadMemberships"),
    );
    const overviewBranch = operationLoader.slice(
      operationLoader.indexOf('if (view === "overview")'),
      operationLoader.indexOf("const results = await Promise.allSettled"),
    );
    expect(overviewBranch).toContain("api.dashboard(context, selectedId)");
    expect(overviewBranch).toContain("api.filingAttempts(context, selectedId)");
    expect(overviewBranch).toContain("Promise.allSettled");
    expect(overviewBranch).toContain("else setFilingAttempts([])");
    for (const call of [
      "api.journals",
      "api.reconciliations",
      "api.workflowTasks",
      "api.reviewPoints",
    ]) expect(overviewBranch).not.toContain(call);
  });

  it("retains accounting detail reads that drive production-stage truth", () => {
    expect(app).toMatch(
      /workspacePage === "engagement"[\s\S]{0,80}view !== "portal"[\s\S]{0,40}\) loadDetail\(\)/,
    );
  });
});
