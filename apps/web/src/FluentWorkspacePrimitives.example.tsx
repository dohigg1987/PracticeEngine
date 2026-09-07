import React, { useMemo } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  ToolbarButton,
  createTableColumn,
} from "@fluentui/react-components";
import type { TableColumnDefinition, TableRowId } from "@fluentui/react-components";
import { AddRegular, ArrowClockwiseRegular } from "@fluentui/react-icons";
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

export type WorkQueueExampleItem = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  ownerName: string;
  dueLabel: string;
  statusLabel: string;
};

export function FluentWorkQueueExample({
  items,
  selectedItemId,
  onSelectedItemChange,
  onRefresh,
  onCreateWork,
  onOpenClient,
}: {
  items: WorkQueueExampleItem[];
  selectedItemId?: string;
  onSelectedItemChange: (rowId: TableRowId | undefined) => void;
  onRefresh: () => void;
  onCreateWork: () => void;
  onOpenClient: (clientId: string) => void;
}) {
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const columns = useMemo<TableColumnDefinition<WorkQueueExampleItem>[]>(() => [
    createTableColumn({ columnId: "work", renderHeaderCell: () => "Work", renderCell: (item) => item.title }),
    createTableColumn({ columnId: "client", renderHeaderCell: () => "Client", renderCell: (item) => item.clientName }),
    createTableColumn({ columnId: "owner", renderHeaderCell: () => "Owner", renderCell: (item) => item.ownerName }),
    createTableColumn({ columnId: "due", renderHeaderCell: () => "Due", renderCell: (item) => item.dueLabel }),
    createTableColumn({ columnId: "status", renderHeaderCell: () => "Status", renderCell: (item) => <Badge appearance="outline">{item.statusLabel}</Badge> }),
  ], []);

  return <FluentWorkspacePage>
    <FluentWorkspaceHeader
      title="Work"
      description="Delivery work requiring attention"
      primaryAction={<Button appearance="primary" icon={<AddRegular />} onClick={onCreateWork}>New work</Button>}
    />
    <FluentCommandBar contextualActions={<ToolbarButton appearance="subtle" disabled={!selectedItem}>Reassign</ToolbarButton>}>
      <ToolbarButton icon={<ArrowClockwiseRegular />} onClick={onRefresh}>Refresh</ToolbarButton>
    </FluentCommandBar>
    <FluentQueueWorkspace inspector={selectedItem ? <FluentRecordInspector
      open
      title={selectedItem.title}
      subtitle={`${selectedItem.clientName} · ${selectedItem.dueLabel}`}
      onClose={() => onSelectedItemChange(undefined)}
      footer={<Button appearance="primary" onClick={() => onOpenClient(selectedItem.clientId)}>Open client</Button>}
    >
      <FluentWorkspaceSection title="Delivery">
        <FluentFieldGroup legend="Responsibility">
          <Field label="Owner"><Input value={selectedItem.ownerName} readOnly /></Field>
          <Field label="Status"><Input value={selectedItem.statusLabel} readOnly /></Field>
        </FluentFieldGroup>
      </FluentWorkspaceSection>
    </FluentRecordInspector> : undefined}>
      <FluentQueueDataGrid
        items={items}
        columns={columns}
        label="Work queue"
        getRowId={(item) => item.id}
        columnSizingOptions={{
          work: { minWidth: 180, idealWidth: 260 },
          client: { minWidth: 140, idealWidth: 200 },
          owner: { minWidth: 110, idealWidth: 140 },
          due: { minWidth: 100, idealWidth: 110 },
          status: { minWidth: 110, idealWidth: 130 },
        }}
        selectedItemId={selectedItemId}
        onSelectedItemChange={onSelectedItemChange}
        empty="No work matches this view."
      />
    </FluentQueueWorkspace>
  </FluentWorkspacePage>;
}
