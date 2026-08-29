import React from "react";
import {
  Body1,
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  InlineDrawer,
  Subtitle2,
  Title2,
  Toolbar,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import type {
  DataGridProps,
  TableColumnDefinition,
  TableColumnSizingOptions,
  TableRowId,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  page: {
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    minInlineSize: 0,
    minBlockSize: 0,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  pageHeader: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalM,
    paddingInline: tokens.spacingHorizontalL,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
    "@media (max-width: 600px)": {
      alignItems: "stretch",
      flexDirection: "column",
      paddingInline: tokens.spacingHorizontalM,
    },
  },
  heading: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
    minInlineSize: 0,
  },
  description: {
    color: tokens.colorNeutralForeground2,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalS,
    "@media (max-width: 600px)": {
      justifyContent: "flex-start",
    },
  },
  commandBar: {
    display: "flex",
    minInlineSize: 0,
    paddingBlock: tokens.spacingVerticalXS,
    paddingInline: tokens.spacingHorizontalM,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  toolbar: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  commands: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
  },
  contextualCommands: {
    marginInlineStart: "auto",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(18rem, 24rem)",
    minInlineSize: 0,
    minBlockSize: 0,
    "@media (max-width: 900px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "auto auto",
    },
  },
  workspaceWithoutInspector: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  queue: {
    minInlineSize: 0,
    minBlockSize: 0,
    overflow: "auto",
  },
  grid: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  inspector: {
    blockSize: "100%",
    maxInlineSize: "none",
    borderInlineStartWidth: tokens.strokeWidthThin,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: tokens.colorNeutralStroke2,
    boxShadow: tokens.shadow4,
    "@media (max-width: 900px)": {
      borderInlineStartWidth: 0,
      borderTopWidth: tokens.strokeWidthThin,
      borderTopStyle: "solid",
      borderTopColor: tokens.colorNeutralStroke2,
      boxShadow: "none",
    },
  },
  inspectorTitle: {
    minInlineSize: 0,
  },
  inspectorFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalS,
  },
  section: {
    display: "grid",
    gap: tokens.spacingVerticalS,
    minInlineSize: 0,
    paddingBlock: tokens.spacingVerticalM,
    paddingInline: tokens.spacingHorizontalL,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
    "@media (max-width: 600px)": {
      paddingInline: tokens.spacingHorizontalM,
    },
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
  fieldset: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
    gap: tokens.spacingHorizontalM,
    minInlineSize: 0,
    margin: 0,
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: 0,
    ...shorthands.border("none"),
  },
  legend: {
    marginBlockEnd: tokens.spacingVerticalXS,
    padding: 0,
    color: tokens.colorNeutralForeground2,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
  },
  empty: {
    paddingBlock: tokens.spacingVerticalL,
    paddingInline: tokens.spacingHorizontalL,
    color: tokens.colorNeutralForeground2,
  },
});

type ClassNameProps = {
  className?: string;
};

export function FluentWorkspacePage({ children, className }: React.PropsWithChildren<ClassNameProps>) {
  const styles = useStyles();
  return <section className={mergeClasses(styles.page, className)}>{children}</section>;
}

export function FluentWorkspaceHeader({
  title,
  description,
  metadata,
  primaryAction,
  secondaryActions,
  className,
}: ClassNameProps & {
  title: string;
  description?: string;
  metadata?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}) {
  const styles = useStyles();
  return <header className={mergeClasses(styles.pageHeader, className)}>
    <div className={styles.heading}>
      <Title2 as="h1">{title}</Title2>
      {description ? <Body1 className={styles.description}>{description}</Body1> : null}
      {metadata}
    </div>
    {primaryAction || secondaryActions ? <div className={styles.headerActions}>
      {secondaryActions}
      {primaryAction}
    </div> : null}
  </header>;
}

export function FluentCommandBar({
  children,
  contextualActions,
  label = "Page commands",
  className,
}: React.PropsWithChildren<ClassNameProps & {
  contextualActions?: React.ReactNode;
  label?: string;
}>) {
  const styles = useStyles();
  return <div className={mergeClasses(styles.commandBar, className)}>
    <Toolbar className={styles.toolbar} size="small" aria-label={label}>
      <div className={styles.commands}>{children}</div>
      {contextualActions ? <div className={mergeClasses(styles.commands, styles.contextualCommands)}>{contextualActions}</div> : null}
    </Toolbar>
  </div>;
}

export function FluentQueueWorkspace({
  children,
  inspector,
  className,
}: React.PropsWithChildren<ClassNameProps & {
  inspector?: React.ReactNode;
}>) {
  const styles = useStyles();
  return <div className={mergeClasses(styles.workspace, !inspector && styles.workspaceWithoutInspector, className)}>
    <div className={styles.queue}>{children}</div>
    {inspector}
  </div>;
}

export function FluentQueueDataGrid<T>({
  items,
  columns,
  label,
  getRowId,
  selectedItemId,
  onSelectedItemChange,
  empty,
  sortable = true,
  resizableColumns = true,
  columnSizingOptions,
}: {
  items: T[];
  columns: TableColumnDefinition<T>[];
  label: string;
  getRowId?: DataGridProps["getRowId"];
  selectedItemId?: TableRowId;
  onSelectedItemChange?: (rowId: TableRowId | undefined) => void;
  empty?: React.ReactNode;
  sortable?: boolean;
  resizableColumns?: boolean;
  columnSizingOptions?: TableColumnSizingOptions;
}) {
  const styles = useStyles();
  if (!items.length) return <div className={styles.empty} role="region" aria-label={label}>{empty}</div>;

  return <DataGrid
    className={styles.grid}
    items={items}
    columns={columns}
    getRowId={getRowId}
    aria-label={label}
    sortable={sortable}
    resizableColumns={resizableColumns}
    columnSizingOptions={columnSizingOptions}
    selectionMode="single"
    selectedItems={selectedItemId === undefined ? undefined : new Set([selectedItemId])}
    onSelectionChange={(_, data) => onSelectedItemChange?.(data.selectedItems.values().next().value)}
  >
    <DataGridHeader>
      <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
    </DataGridHeader>
    <DataGridBody<T>>{({ item, rowId }) => <DataGridRow<T> key={rowId}>
      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
    </DataGridRow>}</DataGridBody>
  </DataGrid>;
}

export function FluentRecordInspector({
  title,
  subtitle,
  open,
  onClose,
  children,
  footer,
  closeLabel = "Close inspector",
  className,
}: React.PropsWithChildren<ClassNameProps & {
  title: string;
  subtitle?: React.ReactNode;
  open: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  closeLabel?: string;
}>) {
  const styles = useStyles();
  return <InlineDrawer className={mergeClasses(styles.inspector, className)} open={open} position="end" separator>
    <DrawerHeader>
      <DrawerHeaderTitle
        className={styles.inspectorTitle}
        action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={closeLabel} onClick={onClose} />}
      >
        {title}
      </DrawerHeaderTitle>
      {subtitle ? <Body1 className={styles.description}>{subtitle}</Body1> : null}
    </DrawerHeader>
    <DrawerBody>{children}</DrawerBody>
    {footer ? <DrawerFooter className={styles.inspectorFooter}>{footer}</DrawerFooter> : null}
  </InlineDrawer>;
}

export function FluentWorkspaceSection({
  title,
  actions,
  children,
  className,
}: React.PropsWithChildren<ClassNameProps & {
  title: string;
  actions?: React.ReactNode;
}>) {
  const styles = useStyles();
  return <section className={mergeClasses(styles.section, className)}>
    <header className={styles.sectionHeader}>
      <Subtitle2 as="h2">{title}</Subtitle2>
      {actions}
    </header>
    {children}
  </section>;
}

export function FluentFieldGroup({
  legend,
  children,
  className,
}: React.PropsWithChildren<ClassNameProps & {
  legend: string;
}>) {
  const styles = useStyles();
  return <fieldset className={mergeClasses(styles.fieldset, className)}>
    <legend className={styles.legend}>{legend}</legend>
    {children}
  </fieldset>;
}
