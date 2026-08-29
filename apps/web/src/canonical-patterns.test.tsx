import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTableColumn, Button, Field, Input } from "@fluentui/react-components";
import { describe, expect, it, vi } from "vitest";

vi.mock("@fluentui/react-components", async () => {
  const { createRequire } = await vi.importActual<{ createRequire: (url: string) => (id: string) => Record<string, unknown> }>("node:module");
  return createRequire(import.meta.url)("@fluentui/react-components");
});

import {
  CommandBar,
  DetailHeader,
  DetailTabs,
  EditForm,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  OperationalDataGrid,
  PageHeader,
  PageShell,
  StatusTreatment,
} from "./CanonicalPatterns";

describe("canonical commercial UI patterns", () => {
  it("keeps one primary action in the page header and secondary commands before it", () => {
    const html = renderToStaticMarkup(<PageShell><PageHeader title="Clients" description="Client relationships" secondaryActions={<Button>Export</Button>} primaryAction={<Button appearance="primary">Add client</Button>} /></PageShell>);
    expect(html).toContain("Clients");
    expect(html.indexOf("Export")).toBeLessThan(html.indexOf("Add client"));
    expect((html.match(/pe-page-primary-action/g) || []).length).toBe(1);
  });

  it("renders filters, commands and a linked primary record identifier", () => {
    const items = [{ id: "client-1", name: "Northstar", status: "active" }];
    const columns = [
      createTableColumn<(typeof items)[number]>({ columnId: "name", renderHeaderCell: () => "Client", renderCell: (item) => item.name }),
      createTableColumn<(typeof items)[number]>({ columnId: "status", renderHeaderCell: () => "Status", renderCell: (item) => item.status }),
    ];
    const html = renderToStaticMarkup(<PageShell>
      <CommandBar><Button>Refresh</Button></CommandBar>
      <FilterBar summary="1 client"><Field label="Search"><Input /></Field></FilterBar>
      <OperationalDataGrid items={items} columns={columns} label="Clients" getRowId={(item) => item.id} primaryColumnId="name" getItemHref={(item) => `/practice/clients/${item.id}`} />
    </PageShell>);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('role="search"');
    expect(html).toContain('href="/practice/clients/client-1"');
  });

  it("provides consistent detail, tabs, edit actions and status treatment", () => {
    const html = renderToStaticMarkup(<PageShell>
      <DetailHeader title="Northstar" status={<StatusTreatment value="in_progress" />} facts={[{ label: "Owner", value: "A. Partner" }]} primaryAction={<Button appearance="primary">Edit</Button>} />
      <DetailTabs tabs={[{ value: "overview", label: "Overview" }, { value: "work", label: "Work" }]} selectedValue="overview" onTabSelect={() => undefined} />
      <EditForm onSubmit={() => undefined} onCancel={() => undefined}><Field label="Legal name"><Input /></Field></EditForm>
    </PageShell>);
    expect(html).toContain("In Progress");
    expect(html).toContain("Overview");
    expect(html.indexOf("Cancel")).toBeLessThan(html.indexOf("Save"));
  });

  it("keeps route context and actionable recovery in loading, empty and error states", () => {
    const loading = renderToStaticMarkup(<LoadingState title="Work" description="Operational work" />);
    const empty = renderToStaticMarkup(<EmptyState title="No work due" description="There is no work in this view." action={<Button appearance="primary">Create work</Button>} />);
    const error = renderToStaticMarkup(<ErrorState message="The service is temporarily unavailable." retry={() => undefined} secondaryAction={<Button>Contact support</Button>} />);
    expect(loading).toContain("Work");
    expect(loading).toContain('role="status"');
    expect(empty).toContain("Create work");
    expect(error).toContain("Try again");
    expect(error).toContain("Contact support");
  });
});
