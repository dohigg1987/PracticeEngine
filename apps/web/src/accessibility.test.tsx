import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  freshAuthToken: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {},
}));
// Node selects Tabster's CommonJS entry during SSR. Load Fluent's matching
// CommonJS build so these assertions exercise the real components rather than
// a div-shaped substitute.
vi.mock("@fluentui/react-components", async () => {
  const { createRequire } = await vi.importActual<{
    createRequire: (url: string) => (id: string) => Record<string, unknown>;
  }>("node:module");
  return createRequire(import.meta.url)("@fluentui/react-components");
});

import EngagementProduction, {
  AccountsPdfArtefact,
  accountsReleaseChecks,
  eligibleFilingVersions,
  filingActions,
  validateRegulatorEvidence,
} from "./EngagementProduction";
import { AppErrorFallback } from "./ErrorBoundary";
import { RoutePanelFallback } from "./RoutePanelBoundary";

describe("accessible recovery and asynchronous states", () => {
  it("announces a top-level failure and exposes a named recovery action", () => {
    const html = renderToStaticMarkup(<AppErrorFallback onReset={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-labelledby="fatal-error-title"');
    expect(html).toContain("<button");
    expect(html).toContain("Reload workspace");
  });

  it("contains a routed panel failure with an in-place retry", () => {
    const html = renderToStaticMarkup(<RoutePanelFallback onRetry={() => {}} />);
    expect(html).toContain('aria-label="Panel recovery"');
    expect(html).toContain("This section could not be displayed");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Reload workspace");
  });

  it("announces a lazy engagement section while its API data loads", () => {
    const html = renderToStaticMarkup(
      <EngagementProduction
        view="working-papers"
        context={{ tenantId: "tenant-1" }}
        engagementId="engagement-1"
        framework="FRS_102"
        onEngagementChanged={() => {}}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("fui-Skeleton");
    expect(html).toContain("Loading engagement section");
  });

  it("announces PDF capability loading with a version-specific artefact control", () => {
    const html = renderToStaticMarkup(
      <AccountsPdfArtefact
        context={{ tenantId: "tenant-1" }}
        engagementId="engagement-1"
        version={{
          id: "version-1",
          version: 1,
          status: "DRAFT",
          trial_balance_id: "tb-1",
          framework_pack_id: "FRS102-2026",
          content_manifest: {},
          content_hash: "hash",
          generated_by: "actor",
          generated_at: "2026-08-18T00:00:00Z",
        }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Checking PDF output");
  });

  it("bounds regulator response evidence before upload", () => {
    const valid = { name: "decision.pdf", size: 2048, type: "application/pdf" };
    expect(validateRegulatorEvidence(valid, "CH-123")).toBe("");
    expect(validateRegulatorEvidence(null, "")).toContain("Choose");
    expect(validateRegulatorEvidence({ ...valid, size: 0 }, "")).toContain(
      "empty",
    );
    expect(
      validateRegulatorEvidence({ ...valid, size: 10 * 1024 * 1024 + 1 }, ""),
    ).toContain("10 MB");
    expect(
      validateRegulatorEvidence(
        { ...valid, type: "application/x-msdownload" },
        "",
      ),
    ).toContain("JSON");
    expect(validateRegulatorEvidence(valid, "x".repeat(256))).toContain("255");
    expect(validateRegulatorEvidence(valid, "bad\u0000reference")).toContain(
      "control",
    );
  });

  it("limits filing preparation and actions to authorised manual-evidence states", () => {
    const base = {
      id: "v1",
      version: 1,
      trial_balance_id: "tb",
      framework_pack_id: "FRS102-2026",
      content_manifest: {},
      content_hash: "hash",
      generated_by: "actor",
      generated_at: "2026-08-18T00:00:00Z",
    } as const;
    const versions = [
      {
        ...base,
        status: "FINAL" as const,
        signoffs: [
          {
            id: "s1",
            signoff_type: "FILING_AUTHORISED",
            signed_by: "partner",
            signed_at: "2026-08-18T00:00:00Z",
            object_version: 1,
          },
        ],
      },
      { ...base, id: "v2", status: "FINAL" as const, signoffs: [] },
      {
        ...base,
        id: "v3",
        status: "APPROVED" as const,
        signoffs: [
          {
            id: "s3",
            signoff_type: "FILING_AUTHORISED",
            signed_by: "partner",
            signed_at: "2026-08-18T00:00:00Z",
            object_version: 1,
          },
        ],
      },
    ];
    expect(eligibleFilingVersions(versions).map((item) => item.id)).toEqual([
      "v1",
    ]);
    expect(filingActions("PREPARED")).toEqual([
      "SUBMITTED",
      "FAILED",
      "WITHDRAWN",
    ]);
    expect(filingActions("SUBMITTED")).toEqual(["FAILED", "WITHDRAWN"]);
    expect(filingActions("ACCEPTED")).toEqual([]);
    expect(filingActions("REJECTED")).toEqual([]);
  });

  it("derives release readiness only from active version-specific evidence", () => {
    const checks = accountsReleaseChecks({
      id: "v1",
      version: 4,
      status: "FINAL",
      trial_balance_id: "tb1",
      framework_pack_id: "FRS102-2026",
      content_manifest: { statements: 4 },
      content_hash: "sha256:content",
      generated_by: "preparer",
      generated_at: "2026-08-18T00:00:00Z",
      signoffs: [
        {
          id: "s1",
          signoff_type: "PREPARED",
          signed_by: "p",
          signed_at: "2026-08-18T00:00:00Z",
          object_version: 4,
        },
        {
          id: "s2",
          signoff_type: "REVIEWED",
          signed_by: "r",
          signed_at: "2026-08-18T00:00:00Z",
          object_version: 4,
          invalidated_at: "2026-08-18T01:00:00Z",
        },
      ],
    });
    expect(
      checks.filter((check) => check.complete).map((check) => check.label),
    ).toEqual(["Content manifest recorded", "Prepared sign-off"]);
    expect(checks[0]?.evidence).toBe("Manifest hash recorded");
  });
});
