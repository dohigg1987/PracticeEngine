import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  freshAuthToken: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {},
}));
vi.mock("@fluentui/react-components", async () => {
  const { createRequire } = await vi.importActual<{ createRequire: (url: string) => (id: string) => Record<string, unknown> }>("node:module");
  return createRequire(import.meta.url)("@fluentui/react-components");
});

import ClientCollaboration, { clientRequestDueLabel, documentsFromRequests, requestNeedsAction } from "./ClientCollaboration";
import type { ClientRequestItem } from "./api";

const request = (overrides: Partial<ClientRequestItem> = {}): ClientRequestItem => ({
  id: "request-1",
  client_id: "client-1",
  title: "Confirm registered office",
  request_type: "confirmation",
  status: "open",
  priority: "normal",
  ...overrides,
});

describe("client collaboration UI contracts", () => {
  it("identifies only requests that still need a client action", () => {
    expect(requestNeedsAction(request())).toBe(true);
    expect(requestNeedsAction(request({ status: "partially_complete" }))).toBe(true);
    expect(requestNeedsAction(request({ status: "responded" }))).toBe(false);
    expect(requestNeedsAction(request({ status: "completed" }))).toBe(false);
  });

  it("makes overdue state explicit without relying on colour", () => {
    const now = new Date("2026-08-26T12:00:00Z");
    expect(clientRequestDueLabel(request({ due_at: "2026-08-20T12:00:00Z" }), now)).toContain("Overdue");
    expect(clientRequestDueLabel(request({ due_at: "2026-09-01T12:00:00Z" }), now)).not.toContain("Overdue");
    expect(clientRequestDueLabel(request({ due_at: null }), now)).toBe("No due date");
  });

  it("deduplicates document versions represented by multiple request envelopes", () => {
    const document = { id: "document-1", display_filename: "Evidence.pdf", visibility: "shared_with_client" as const, current_version: 2 };
    expect(documentsFromRequests([
      { ...request(), documents: [document] },
      { ...request({ id: "request-2" }), documents: [document] },
    ])).toEqual([document]);
  });

  it("announces loading for practice and portal entry points", () => {
    for (const mode of ["staff", "portal"] as const) {
      const html = renderToStaticMarkup(<ClientCollaboration context={{ tenantId: "tenant-1" }} mode={mode} />);
      expect(html).toContain('role="status"');
      expect(html).toContain("Loading client");
    }
  });
});
