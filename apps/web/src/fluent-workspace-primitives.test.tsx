import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTableColumn } from "@fluentui/react-components";
import { describe, expect, it, vi } from "vitest";

vi.mock("@fluentui/react-components", async () => {
  const { createRequire } = await vi.importActual<{ createRequire: (url: string) => (id: string) => Record<string, unknown> }>("node:module");
  return createRequire(import.meta.url)("@fluentui/react-components");
});

import {
  FluentCommandBar,
  FluentFieldGroup,
  FluentQueueDataGrid,
  FluentQueueWorkspace,
  FluentRecordInspector,
  FluentWorkspaceHeader,
  FluentWorkspacePage,
  FluentWorkspaceSection,
} from "./FluentWorkspacePrimitives";
import { FluentWorkQueueExample } from "./FluentWorkspacePrimitives.example";

describe("Fluent workspace primitives", () => {
  it("provides labelled page, command, queue, inspector, section and field-group structure", () => {
    const items = [{ id: "work-1", title: "Annual accounts" }];
    const columns = [createTableColumn<(typeof items)[number]>({
      columnId: "work",
      renderHeaderCell: () => "Work",
      renderCell: (item) => item.title,
    })];
    const html = renderToStaticMarkup(<FluentWorkspacePage>
      <FluentWorkspaceHeader title="Work" description="Operational delivery" />
      <FluentCommandBar>Refresh</FluentCommandBar>
      <FluentQueueWorkspace inspector={<FluentRecordInspector open title="Annual accounts" onClose={() => undefined}>
        <FluentWorkspaceSection title="Delivery">
          <FluentFieldGroup legend="Responsibility">Owner</FluentFieldGroup>
        </FluentWorkspaceSection>
      </FluentRecordInspector>}>
        <FluentQueueDataGrid items={items} columns={columns} label="Work queue" getRowId={(item) => item.id} />
      </FluentQueueWorkspace>
    </FluentWorkspacePage>);

    expect(html).toContain("Operational delivery");
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Work queue"');
    expect(html).toContain("Annual accounts");
    expect(html).toContain("Delivery");
    expect(html).toContain("<fieldset");
    expect(html).toContain("Responsibility");
    expect(html).toContain('aria-label="Close inspector"');
  });

  it("renders the worked queue-to-inspector example without embedding domain state", () => {
    const html = renderToStaticMarkup(<FluentWorkQueueExample
      items={[{
        id: "work-1",
        title: "VAT return",
        clientId: "client-1",
        clientName: "Northstar",
        ownerName: "A. Partner",
        dueLabel: "31 August",
        statusLabel: "In progress",
      }]}
      selectedItemId="work-1"
      onSelectedItemChange={() => undefined}
      onRefresh={() => undefined}
      onCreateWork={() => undefined}
      onOpenClient={() => undefined}
    />);

    expect(html).toContain("VAT return");
    expect(html).toContain("Northstar");
    expect(html).toContain("A. Partner");
    expect(html).toContain("Reassign");
    expect(html).toContain("Open client");
  });

  it("renders a queue empty state in the labelled work region", () => {
    const html = renderToStaticMarkup(<FluentQueueDataGrid
      items={[] as Array<{ id: string }>}
      columns={[]}
      label="Empty work queue"
      empty="No work matches this view."
    />);

    expect(html).toContain("No work matches this view.");
    expect(html).toContain('aria-label="Empty work queue"');
  });
});
