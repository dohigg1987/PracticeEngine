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

import PracticeManagement, { assignmentDisplay, filterPracticeWork, initialWorkFilters, isOverdue, practiceServiceCategories, practiceServiceCreateInput, safeAssignmentName, taskAssignmentDisplay } from "./PracticeManagement";
import { practiceClientSummaryItem, type PracticeClientSummary, type PracticeWorkItem } from "./api";

const items: PracticeWorkItem[] = [
  { id: "w1", client_id: "c1", client_name: "Northstar", client_service_id: "cs1", service_name: "Annual accounts", title: "2026 Accounts", status: "in_progress", priority: "high", due_date: "2027-09-30" },
  { id: "w2", client_id: "c2", client_name: "Harbour", client_service_id: "cs2", service_name: "VAT returns", title: "Q1 VAT", status: "waiting_on_client", priority: "urgent", due_date: "2027-05-07" },
];

describe("Practice Management UI contracts", () => {
  it("filters work across operational context and exact status/priority", () => {
    expect(filterPracticeWork(items, "north", "", "").map((item) => item.id)).toEqual(["w1"]);
    expect(filterPracticeWork(items, "VAT", "waiting_on_client", "urgent").map((item) => item.id)).toEqual(["w2"]);
    expect(filterPracticeWork(items, "", "completed", "")).toEqual([]);
  });

  it("restores supported Home queue filters from a work deep link", () => {
    expect(initialWorkFilters("?status=waiting_on_client")).toEqual({ status: "waiting_on_client", due: "" });
    expect(initialWorkFilters("?due=overdue")).toEqual({ status: "", due: "overdue" });
    expect(initialWorkFilters("?status=unknown&due=all")).toEqual({ status: "", due: "" });
  });

  it("filters overdue and due-this-week work without treating completed work as overdue", () => {
    const today = new Date("2027-05-03T12:00:00");
    expect(filterPracticeWork(items, "", "", "", "overdue", today).map((item) => item.id)).toEqual([]);
    expect(filterPracticeWork(items, "", "", "", "this-week", today).map((item) => item.id)).toEqual(["w2"]);
  });

  it("filters work by client, service, assignee and team dimensions", () => {
    const assigned = { ...items[0], assigned_member_id: "member-1", assigned_member_name: "Morgan Reed", assigned_team_id: "team-1", assigned_team_name: "Accounts" };
    expect(filterPracticeWork([assigned, items[1]], "", "", "", "", new Date(), { client: "c1", service: "cs1", assignee: "member-1", team: "team-1" }).map((item) => item.id)).toEqual(["w1"]);
    expect(filterPracticeWork([assigned, items[1]], "", "", "", "", new Date(), { assignee: "unassigned" }).map((item) => item.id)).toEqual(["w2"]);
  });

  it("only marks unfinished work overdue", () => {
    const today = new Date("2027-06-01T12:00:00Z");
    expect(isOverdue("2027-05-07", "in_progress", today)).toBe(true);
    expect(isOverdue("2027-05-07", "completed", today)).toBe(false);
    expect(isOverdue(null, "in_progress", today)).toBe(false);
  });

  it("unwraps the live client-summary envelope", () => {
    const item: PracticeClientSummary = {
      client: { id: "c1", legal_name: "Northstar" },
      services: [], engagements: [], workItems: [], upcomingTasks: [],
    };
    expect(practiceClientSummaryItem({ item })).toBe(item);
  });

  it("requires a supported category in the service creation contract", () => {
    expect(practiceServiceCategories).toContain("accounts");
    expect(practiceServiceCreateInput("  Annual accounts  ", "accounts")).toEqual({
      name: "Annual accounts", category: "accounts", status: "active",
    });
  });

  it("never exposes internal assignment identifiers and remains truthful", () => {
    expect(safeAssignmentName("Demo Partner")).toBe("Demo Partner");
    expect(safeAssignmentName("29550f55-0e1a-4f39-8ed8-43dfdf62f114")).toBe("");
    expect(safeAssignmentName("neon|user_0123456789abcdef")).toBe("");
    expect(assignmentDisplay({ assigned_member_id: "member-1", assigned_member_name: "29550f55-0e1a-4f39-8ed8-43dfdf62f114" })).toBe("Assigned");
    expect(assignmentDisplay({ assigned_team_id: "team-1" })).toBe("Assigned team");
    expect(taskAssignmentDisplay({ id: "t1", work_item_id: "w1", title: "Review", status: "not_started", assignee_member_id: "member-1", sequence: 1 })).toBe("Assigned");
    expect(taskAssignmentDisplay({ id: "t2", work_item_id: "w1", title: "Review", status: "not_started", team_id: "team-1", sequence: 1 })).toBe("Assigned team");
  });

  it("announces each asynchronous Practice Management surface", () => {
    for (const view of ["work", "work-detail", "client-summary", "settings"] as const) {
      const html = renderToStaticMarkup(<PracticeManagement view={view} context={{ tenantId: "tenant-1" }} workItemId="work-1" clientId="client-1" />);
      expect(html).toContain('role="status"');
      expect(html).toContain("Loading");
    }
  });
});
