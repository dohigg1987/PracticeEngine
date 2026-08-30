import React from "react";
import {
  Badge,
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Link,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Tab,
  TabList,
} from "@fluentui/react-components";
import type {
  DataGridProps,
  SelectTabData,
  SelectTabEvent,
  TableColumnDefinition,
  TableColumnSizingOptions,
  TabValue,
} from "@fluentui/react-components";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { statutoryLabel } from "./format";
import { statusBadgeProps } from "./statusBadge";
import "./canonical-patterns.css";

type Action = React.ReactNode;

const MasterDetailSelectionContext = React.createContext(false);

const masterDetailColumnSizingById: TableColumnSizingOptions = {
  work: { minWidth: 180, idealWidth: 260 },
  due: { minWidth: 82, idealWidth: 104 },
  owner: { minWidth: 96, idealWidth: 132 },
  state: { minWidth: 96, idealWidth: 114 },
  status: { minWidth: 96, idealWidth: 124 },
  priority: { minWidth: 72, idealWidth: 84 },
};

function inferredMasterDetailColumnSizing<T>(columns: TableColumnDefinition<T>[]) {
  if (!columns.every((column) => masterDetailColumnSizingById[String(column.columnId)])) return undefined;
  return Object.fromEntries(columns.map((column) => {
    const columnId = String(column.columnId);
    return [columnId, masterDetailColumnSizingById[columnId]];
  })) as TableColumnSizingOptions;
}

export function PageShell({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <section className={`pe-page-shell ${className}`.trim()}>{children}</section>;
}

export function PageHeader({
  title,
  description,
  back,
  backLabel = "Back",
  primaryAction,
  secondaryActions,
  meta,
}: {
  title: string;
  description?: string;
  back?: () => void;
  backLabel?: string;
  primaryAction?: Action;
  secondaryActions?: Action;
  meta?: React.ReactNode;
}) {
  return <header className="pe-page-header">
    {back && <Button appearance="subtle" icon={<ArrowLeftRegular />} aria-label={backLabel} onClick={back} />}
    <div className="pe-page-heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {meta && <div className="pe-page-meta">{meta}</div>}
    </div>
    {(primaryAction || secondaryActions) && <div className="pe-page-actions">
      {secondaryActions}
      {primaryAction && <div className="pe-page-primary-action">{primaryAction}</div>}
    </div>}
  </header>;
}

export function CommandBar({ children, contextualActions }: React.PropsWithChildren<{ contextualActions?: React.ReactNode }>) {
  return <div className="pe-command-bar" role="toolbar" aria-label="Page commands">
    <div className="pe-command-bar-main">{children}</div>
    {contextualActions && <div className="pe-command-bar-context">{contextualActions}</div>}
  </div>;
}

export function SavedViewBar({ views, selectedValue, onSelect, label = "Saved views" }: {
  views: ReadonlyArray<{ value: string; label: string; count?: number }>;
  selectedValue: string;
  onSelect: (value: string) => void;
  label?: string;
}) {
  return <nav className="pe-saved-views" aria-label={label}>
    {views.map((view) => <Button key={view.value} appearance={selectedValue === view.value ? "primary" : "subtle"} aria-current={selectedValue === view.value ? "page" : undefined} onClick={() => onSelect(view.value)}>
      {view.label}{view.count === undefined ? null : <span className="pe-view-count">{view.count}</span>}
    </Button>)}
  </nav>;
}

export function CompactFilterBar({ children, advanced, advancedOpen, onAdvancedToggle, summary, reset, label = "Filters" }: React.PropsWithChildren<{
  advanced?: React.ReactNode;
  advancedOpen?: boolean;
  onAdvancedToggle?: () => void;
  summary?: React.ReactNode;
  reset?: () => void;
  label?: string;
}>) {
  return <div className="pe-compact-filter-region" role="region" aria-label={label}>
    <div className="pe-compact-filter-row" role="search" aria-label={`${label} fields`}>
      {children}
      {advanced && <Button appearance="subtle" size="small" aria-expanded={advancedOpen} onClick={onAdvancedToggle}>More filters</Button>}
    </div>
    {advancedOpen && advanced ? <div className="pe-advanced-filters">{advanced}</div> : null}
    {(summary || reset) && <div className="pe-filter-summary"><span aria-live="polite">{summary}</span>{reset && <Button appearance="subtle" size="small" onClick={reset}>Clear</Button>}</div>}
  </div>;
}

export function MasterDetailWorkspace({ children, inspector, selected = false, className = "" }: React.PropsWithChildren<{ inspector?: React.ReactNode; selected?: boolean; className?: string }>) {
  return <div className={`pe-master-detail ${selected ? "pe-master-detail--selected" : ""} ${className}`.trim()}>
    <MasterDetailSelectionContext.Provider value={selected}>
      <div className="pe-master-region">{children}</div>
    </MasterDetailSelectionContext.Provider>
    {inspector && <aside className="pe-inspector-region" aria-label="Selected record inspector">{inspector}</aside>}
  </div>;
}

export function WorkingInspector({ title, subtitle, status, onClose, children, footer }: React.PropsWithChildren<{ title: string; subtitle?: string; status?: React.ReactNode; onClose?: () => void; footer?: React.ReactNode }>) {
  return <section className="pe-working-inspector">
    <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="pe-inspector-head-actions">{status}{onClose && <Button appearance="subtle" size="small" onClick={onClose}>Close</Button>}</div></header>
    <div className="pe-inspector-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </section>;
}

export function PersistentClientFrame({ identity, commands, navigation, children, contextPane }: React.PropsWithChildren<{ identity: React.ReactNode; commands?: React.ReactNode; navigation: React.ReactNode; contextPane?: React.ReactNode }>) {
  return <section className="pe-client-frame">
    <header className="pe-client-identity">{identity}</header>
    {commands && <div className="pe-client-commands">{commands}</div>}
    <div className="pe-client-workspace">
      <aside className="pe-client-local-nav">{navigation}</aside>
      <div className="pe-client-main">{children}</div>
      {contextPane && <aside className="pe-client-context" aria-label="Client context">{contextPane}</aside>}
    </div>
  </section>;
}

export function ContextualPane({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <section className="pe-contextual-pane"><h2>{title}</h2>{children}</section>;
}

export function FilterBar({ children, summary, reset, label = "Filters" }: React.PropsWithChildren<{ summary?: React.ReactNode; reset?: () => void; label?: string }>) {
  return <div className="pe-filter-region" role="region" aria-label={label}>
    <div className="pe-filter-bar" role="search" aria-label={`${label} fields`}>{children}</div>
    {(summary || reset) && <div className="pe-filter-summary">
      <span aria-live="polite">{summary}</span>
      {reset && <Button appearance="subtle" size="small" onClick={reset}>Clear filters</Button>}
    </div>}
  </div>;
}

export function OperationalDataGrid<T>({
  items,
  columns,
  label,
  getRowId,
  primaryColumnId,
  getItemHref,
  onOpenItem,
  empty,
  sortable = true,
  columnSizingOptions,
}: {
  items: T[];
  columns: TableColumnDefinition<T>[];
  label: string;
  getRowId?: DataGridProps["getRowId"];
  primaryColumnId?: string;
  getItemHref?: (item: T) => string;
  onOpenItem?: (item: T) => void;
  empty?: React.ReactNode;
  sortable?: boolean;
  columnSizingOptions?: TableColumnSizingOptions;
}) {
  const inSelectedMasterDetail = React.useContext(MasterDetailSelectionContext);
  const resolvedColumnSizing = columnSizingOptions ?? (inSelectedMasterDetail ? inferredMasterDetailColumnSizing(columns) : undefined);
  if (!items.length) return <>{empty}</>;
  return <div className="pe-operational-grid">
    <DataGrid items={items} columns={columns} sortable={sortable} getRowId={getRowId} aria-label={label} resizableColumns={resolvedColumnSizing ? true : undefined} columnSizingOptions={resolvedColumnSizing}>
      <DataGridHeader>
        <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
      </DataGridHeader>
      <DataGridBody<T>>{({ item, rowId }) => <DataGridRow<T> key={rowId}>
        {({ renderCell, columnId }) => <DataGridCell>
          {String(columnId) === primaryColumnId && getItemHref
            ? <Link href={getItemHref(item)} onClick={onOpenItem ? (event) => { event.preventDefault(); onOpenItem(item); } : undefined}>{renderCell(item)}</Link>
            : renderCell(item)}
        </DataGridCell>}
      </DataGridRow>}
      </DataGridBody>
    </DataGrid>
  </div>;
}

export function DetailHeader({
  title,
  description,
  back,
  backLabel,
  status,
  facts,
  primaryAction,
  secondaryActions,
}: {
  title: string;
  description?: string;
  back?: () => void;
  backLabel?: string;
  status?: React.ReactNode;
  facts?: Array<{ label: string; value: React.ReactNode }>;
  primaryAction?: Action;
  secondaryActions?: Action;
}) {
  return <div className="pe-detail-header">
    <PageHeader title={title} description={description} back={back} backLabel={backLabel} meta={status} primaryAction={primaryAction} secondaryActions={secondaryActions} />
    {facts?.length ? <dl className="pe-detail-facts">{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
  </div>;
}

export function DetailTabs({
  tabs,
  selectedValue,
  onTabSelect,
  label = "Record sections",
}: {
  tabs: ReadonlyArray<{ value: string; label: string }>;
  selectedValue: TabValue;
  onTabSelect: (event: SelectTabEvent, data: SelectTabData) => void;
  label?: string;
}) {
  return <div className="pe-detail-tabs"><TabList aria-label={label} selectedValue={selectedValue} onTabSelect={onTabSelect}>
    {tabs.map((tab) => <Tab key={tab.value} value={tab.value}>{tab.label}</Tab>)}
  </TabList></div>;
}

export function EditForm({
  children,
  onSubmit,
  onCancel,
  busy = false,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  className = "",
}: React.PropsWithChildren<{
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  busy?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  className?: string;
}>) {
  return <form className={`pe-edit-form ${className}`.trim()} onSubmit={onSubmit} noValidate>
    {children}
    <div className="pe-form-actions">
      <Button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
      <Button type="submit" appearance="primary" disabled={busy}>{busy ? "Saving…" : saveLabel}</Button>
    </div>
  </form>;
}

export function EmptyState({ title, description, action, secondaryAction }: { title: string; description: string; action?: Action; secondaryAction?: Action }) {
  return <div className="pe-state pe-empty-state">
    <h2>{title}</h2>
    <p>{description}</p>
    {(action || secondaryAction) && <div className="pe-state-actions">{action}{secondaryAction}</div>}
  </div>;
}

export function LoadingState({ title, description, kind = "grid" }: { title: string; description?: string; kind?: "grid" | "detail" | "form" }) {
  const rows = kind === "detail" ? 4 : kind === "form" ? 3 : 6;
  return <PageShell><PageHeader title={title} description={description} /><Skeleton className={`pe-loading-state pe-loading-${kind}`} aria-label={`Loading ${title.toLowerCase()}`} role="status">
    {Array.from({ length: rows }, (_, index) => <SkeletonItem key={index} size={index === 0 ? 24 : 16} />)}
  </Skeleton></PageShell>;
}

export function ErrorState({ title = "This page could not be loaded", message, retry, secondaryAction }: { title?: string; message: string; retry?: () => void; secondaryAction?: Action }) {
  return <MessageBar intent="error" className="pe-error-state">
    <MessageBarBody><strong>{title}</strong><span>{message}</span></MessageBarBody>
    <div className="pe-state-actions">{retry && <Button appearance="subtle" onClick={retry}>Try again</Button>}{secondaryAction}</div>
  </MessageBar>;
}

export function StatusTreatment({ value }: { value: string }) {
  return <Badge className="pe-status-treatment" {...statusBadgeProps(value)}>{statutoryLabel(value)}</Badge>;
}

export function ContextualActions({ children }: React.PropsWithChildren) {
  return <div className="pe-contextual-actions" aria-label="Record actions">{children}</div>;
}
