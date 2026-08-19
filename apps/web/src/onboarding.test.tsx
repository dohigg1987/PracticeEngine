import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  authClient: null,
  authConfigured: false,
  AuthRequiredError: class AuthRequiredError extends Error {},
  freshAuthToken: vi.fn(),
}));
vi.mock("@fluentui/react-components", () => {
  const Component = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Badge: Component,
    Breadcrumb: Component,
    BreadcrumbButton: Component,
    BreadcrumbDivider: Component,
    BreadcrumbItem: Component,
    Button: Component,
    Field: Component,
    Input: Component,
    MessageBar: Component,
    MessageBarActions: Component,
    MessageBarBody: Component,
    NavDrawer: Component,
    NavDrawerBody: Component,
    NavItem: Component,
    ProgressBar: Component,
    SearchBox: Component,
    Select: Component,
    Skeleton: Component,
    SkeletonItem: Component,
    Table: Component,
    TableBody: Component,
    TableCell: Component,
    TableHeader: Component,
    TableHeaderCell: Component,
    TableRow: Component,
    Textarea: Component,
    Tab: Component,
    TabList: Component,
    Toolbar: Component,
    Tree: Component,
    TreeItem: Component,
    TreeItemLayout: Component,
  };
});
vi.mock("@fluentui/react-icons", () => ({
  BuildingRegular: () => null,
  CheckmarkCircleRegular: () => null,
  CheckmarkRegular: () => null,
  DocumentRegular: () => null,
  ErrorCircleRegular: () => null,
  NavigationRegular: () => null,
  OpenRegular: () => null,
  PeopleTeamRegular: () => null,
  SearchRegular: () => null,
}));

import {
  InviteAcceptance,
  inviteTokenFromHash,
  matchWorkspaceSearch,
  NoMembership,
  onboardingAllowsCreation,
} from "./App";

const user = { id: "actor-1", email: "owner@example.com", name: "Owner" };

describe("zero-membership onboarding UI", () => {
  it("matches all search terms across labels, descriptions and keywords", () => {
    const entries = [
      {
        id: "client",
        label: "Northstar Foundation",
        description: "Client",
        keywords: "charity Bristol",
      },
      {
        id: "journal",
        label: "Journals",
        description: "Engagement section",
        keywords: "adjustments",
      },
    ];
    expect(
      matchWorkspaceSearch(entries, "north charity").map((item) => item.id),
    ).toEqual(["client"]);
    expect(
      matchWorkspaceSearch(entries, "adjustments").map((item) => item.id),
    ).toEqual(["journal"]);
    expect(
      matchWorkspaceSearch(
        [
          ...entries,
          {
            id: "north-section",
            label: "Accounts versions",
            description: "Northstar engagement section",
            keywords: "versions",
          },
        ],
        "north",
      ).map((item) => item.id),
    ).toEqual(["client", "north-section"]);
    expect(matchWorkspaceSearch(entries, "  ")).toEqual([]);
  });
  it("extracts invite secrets only from the URL fragment convention", () => {
    expect(inviteTokenFromHash("#token=abc_DEF-123")).toBe("abc_DEF-123");
    expect(inviteTokenFromHash("#other=value")).toBe("");
    expect(inviteTokenFromHash("?token=leaked-query-token")).toBe("");
  });

  it("offers explicit invite acceptance without rendering the secret token", () => {
    const html = renderToStaticMarkup(
      <InviteAcceptance
        token="do-not-render-this-secret"
        onCancel={() => {}}
        onAccepted={async () => {}}
      />,
    );
    expect(html).toContain("Accept invitation");
    expect(html).toContain("Continue without invite");
    expect(html).not.toContain("do-not-render-this-secret");
  });
  it("shows self-service creation only for the explicit availability code", () => {
    const onboarding = {
      code: "SELF_SERVICE_WORKSPACE_AVAILABLE",
      message: "Create a workspace to get started.",
    };
    const html = renderToStaticMarkup(
      <NoMembership
        user={user}
        onboarding={onboarding}
        onRetry={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(onboardingAllowsCreation(onboarding)).toBe(true);
    expect(html).toContain("Create your first workspace");
    expect(html).toContain("new-workspace-name");
    expect(html).toContain('maxLength="160"');
  });

  it("retains trusted-administrator guidance when onboarding is disabled", () => {
    const onboarding = {
      code: "TENANT_PROVISIONING_REQUIRED",
      message:
        "Ask a trusted administrator to provision your first tenant membership.",
    };
    const html = renderToStaticMarkup(
      <NoMembership
        user={user}
        onboarding={onboarding}
        onRetry={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(onboardingAllowsCreation(onboarding)).toBe(false);
    expect(html).toContain("trusted administrator");
    expect(html).toContain("Check again");
    expect(html).not.toContain("new-workspace-name");
  });
});
