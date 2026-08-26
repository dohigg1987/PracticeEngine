import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Skeleton,
  SkeletonItem,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Textarea,
} from "@fluentui/react-components";
import {
  api,
  ApiContext,
  DocumentRequest,
  Engagement,
  ExportCapability,
  ExportRequest,
  Integration,
  NormalizedImportPreview,
  NotificationItem,
  PortalContact,
  SyncRun,
  TenantSettings,
  TrialBalanceColumnMapping,
  TrialBalanceField,
} from "./api";
import { ConfirmAction, ReasonAction } from "./ConfirmAction";
import { formatDate, formatDateTime } from "./displayFormat";
import { statutoryLabel } from "./format";
import { RoutePanelBoundary } from "./RoutePanelBoundary";
import { statusBadgeProps } from "./statusBadge";
import { inboxEmptyMessage } from "./inboxState";

export type CommercialView = "portal" | "integrations" | "inbox" | "settings";
type Props = {
  view: CommercialView;
  context: ApiContext;
  engagementId?: string;
  engagements: Engagement[];
  onOpenSource?: (engagementId: string) => void;
};
const readable = statutoryLabel;
const when = (value?: string | null) => formatDateTime(value, "Not recorded");
const periodDate = (value?: string | null) => formatDate(value, "Date unavailable");
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
function PageHead({
  title,
  body,
  children,
}: React.PropsWithChildren<{ title: string; body: string }>) {
  return (
    <header className="commercial-head">
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      {children}
    </header>
  );
}
function LoadState({ label }: { label: string }) {
  return (
    <Skeleton className="commercial-loading" aria-label={label} role="status">
      <SkeletonItem size={24} />
      <SkeletonItem />
      <SkeletonItem />
      <SkeletonItem />
    </Skeleton>
  );
}
function Failure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <MessageBar className="commercial-message" intent="error">
      <MessageBarBody>{message}</MessageBarBody>
      <Button appearance="transparent" onClick={retry}>
        Retry
      </Button>
    </MessageBar>
  );
}

export default function CommercialWorkspace(props: Props) {
  if (props.view === "portal")
    return (
      <PortalWorkspace {...props} engagementId={props.engagementId || ""} />
    );
  if (props.view === "integrations")
    return (
      <RoutePanelBoundary resetKey={`${props.context.tenantId}:${props.engagementId || "all"}`}>
        <ImportCentre {...props} />
      </RoutePanelBoundary>
    );
  if (props.view === "inbox") return <Inbox {...props} />;
  return <WorkspaceSettings {...props} />;
}

function PortalWorkspace({
  context,
  engagementId,
}: Props & { engagementId: string }) {
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [contact, setContact] = useState({
    displayName: "",
    email: "",
    accessRole: "CLIENT_PREPARER" as PortalContact["accessRole"],
  });
  const [request, setRequest] = useState({
    title: "",
    description: "",
    dueAt: "",
    assignedContactId: "",
    documentType: "",
  });
  const load = useCallback(async () => {
    if (!engagementId) return;
    setLoading(true);
    setError("");
    try {
      const [contactData, requestData] = await Promise.all([
        api.portalContacts(context, engagementId),
        api.documentRequests(context, engagementId),
      ]);
      setContacts(contactData.items);
      setRequests(requestData.items);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId]);
  useEffect(() => {
    load();
  }, [load]);
  async function act(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setActionError("");
    try {
      await action();
      await load();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  if (!engagementId)
    return (
      <Failure
        message="Select an engagement to manage its client portal."
        retry={() => {}}
      />
    );
  if (loading) return <LoadState label="Loading client portal" />;
  if (error) return <Failure message={error} retry={load} />;
  return (
    <section className="commercial-page">
      <PageHead
        title="Client portal"
        body="Control named client access, evidence requests and approval decisions for this engagement."
      >
        <Button onClick={load}>Refresh</Button>
      </PageHead>
      <MessageBar className="commercial-message" intent="info">
        <MessageBarBody>
          Portal invitations are one-time links. Files remain authenticated
          evidence; storage locations and invite secrets are never listed.
        </MessageBarBody>
      </MessageBar>
      {actionError && (
        <MessageBar className="commercial-message" intent="error">
          <MessageBarBody>{actionError}</MessageBarBody>
        </MessageBar>
      )}
      {inviteUrl && (
        <div className="commercial-secret" role="status">
          <div>
            <b>Copy this invitation now</b>
            <span>
              The secret link is shown once and is not delivered by email.
            </span>
          </div>
          <Input
            readOnly
            value={inviteUrl}
            aria-label="Client invitation link"
          />
          <Button onClick={() => navigator.clipboard.writeText(inviteUrl)}>
            Copy
          </Button>
          <Button appearance="subtle" onClick={() => setInviteUrl("")}>
            Dismiss
          </Button>
        </div>
      )}
      <section className="commercial-section">
        <header>
          <div>
            <h2>Client contacts</h2>
            <p>Access is scoped to this engagement and assigned role.</p>
          </div>
        </header>
        <form
          className="commercial-form"
          onSubmit={(event) => {
            event.preventDefault();
            act("contact", async () => {
              await api.createPortalContact(context, engagementId, contact);
              setContact({
                displayName: "",
                email: "",
                accessRole: "CLIENT_PREPARER",
              });
            });
          }}
        >
          <Field label="Name" required>
            <Input
              value={contact.displayName}
              onChange={(_, data) =>
                setContact({ ...contact, displayName: data.value })
              }
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={contact.email}
              onChange={(_, data) =>
                setContact({ ...contact, email: data.value })
              }
            />
          </Field>
          <Field label="Portal role">
            <Select
              value={contact.accessRole}
              onChange={(event) =>
                setContact({
                  ...contact,
                  accessRole: event.target.value as PortalContact["accessRole"],
                })
              }
            >
              <option value="CLIENT_PREPARER">Client preparer</option>
              <option value="CLIENT_APPROVER">Client approver</option>
              <option value="CLIENT_VIEWER">Client viewer</option>
            </Select>
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={busy === "contact"}
          >
            Add contact
          </Button>
        </form>
        <div className="commercial-table">
          <Table size="small" aria-label="Client portal contacts">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Contact</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <b>{item.displayName}</b>
                    <small>{item.email}</small>
                  </TableCell>
                  <TableCell>{readable(item.accessRole)}</TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps(item.accessStatus)}>
                      {readable(item.accessStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="row-actions">
                      {item.accessStatus !== "ACTIVE" &&
                        item.accessStatus !== "REVOKED" && (
                          <Button
                            size="small"
                            onClick={() =>
                              act(`invite-${item.id}`, async () => {
                                const result = await api.invitePortalContact(
                                  context,
                                  engagementId,
                                  item.id,
                                );
                                setInviteUrl(result.inviteUrl);
                              })
                            }
                          >
                            Create invite
                          </Button>
                        )}
                      {item.accessStatus === "ACTIVE" && (
                        <ConfirmAction
                          label="Suspend"
                          title="Suspend portal access?"
                          body={`${item.displayName} will no longer be able to access this engagement.`}
                          confirmLabel="Suspend access"
                          appearance="subtle"
                          onConfirm={() =>
                            act(`suspend-${item.id}`, () =>
                              api.updatePortalAccess(
                                context,
                                engagementId,
                                item.id,
                                "SUSPENDED",
                                "Suspended by staff in the accounts workspace",
                              ),
                            )
                          }
                        />
                      )}
                      {item.accessStatus === "SUSPENDED" && (
                        <Button
                          size="small"
                          onClick={() =>
                            act(`restore-${item.id}`, () =>
                              api.updatePortalAccess(
                                context,
                                engagementId,
                                item.id,
                                "ACTIVE",
                                "Restored by staff in the accounts workspace",
                              ),
                            )
                          }
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="commercial-section">
        <header>
          <div>
            <h2>Document requests</h2>
            <p>Request, receive and review client-supplied evidence.</p>
          </div>
        </header>
        <form
          className="commercial-form request-form"
          onSubmit={(event) => {
            event.preventDefault();
            act("request", async () => {
              await api.createDocumentRequest(context, engagementId, request);
              setRequest({
                title: "",
                description: "",
                dueAt: "",
                assignedContactId: "",
                documentType: "",
              });
            });
          }}
        >
          <Field label="Request" required>
            <Input
              value={request.title}
              onChange={(_, data) =>
                setRequest({ ...request, title: data.value })
              }
            />
          </Field>
          <Field label="Assigned contact">
            <Select
              value={request.assignedContactId}
              onChange={(event) =>
                setRequest({
                  ...request,
                  assignedContactId: event.target.value,
                })
              }
            >
              <option value="">Unassigned</option>
              {contacts
                .filter((item) => item.accessStatus === "ACTIVE")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={request.dueAt}
              onChange={(_, data) =>
                setRequest({ ...request, dueAt: data.value })
              }
            />
          </Field>
          <Field label="Document type">
            <Input
              value={request.documentType}
              onChange={(_, data) =>
                setRequest({ ...request, documentType: data.value })
              }
              placeholder="Bank statement"
            />
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={busy === "request"}
          >
            Send request
          </Button>
        </form>
        <div className="commercial-table">
          <Table size="small" aria-label="Client document requests">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Request</TableHeaderCell>
                <TableHeaderCell>Assigned</TableHeaderCell>
                <TableHeaderCell>Due</TableHeaderCell>
                <TableHeaderCell>Evidence</TableHeaderCell>
                <TableHeaderCell>Status / actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <b>{item.title}</b>
                    <small>
                      {item.documentType ||
                        item.description ||
                        "General evidence"}
                    </small>
                  </TableCell>
                  <TableCell>
                    {contacts.find(
                      (contactItem) =>
                        contactItem.id === item.assignedContactId,
                    )?.displayName || "Unassigned"}
                  </TableCell>
                  <TableCell>
                    {item.dueAt ? when(item.dueAt) : "No due date"}
                  </TableCell>
                  <TableCell>
                    {item.latestResponse ? (
                      <span>
                        {item.latestResponse.filename} ·{" "}
                        {(item.latestResponse.byteSize / 1024).toFixed(1)} KB
                      </span>
                    ) : (
                      "Awaiting response"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps(item.status)}>
                      {readable(item.status)}
                    </Badge>
                    <div className="row-actions">
                      {item.status === "RESPONDED" && item.latestResponse && (
                        <>
                          <Button
                            size="small"
                            appearance="primary"
                            onClick={() =>
                              act(`approve-${item.id}`, () =>
                                api.reviewDocumentResponse(
                                  context,
                                  engagementId,
                                  item.id,
                                  item.latestResponse!.id,
                                  "APPROVED",
                                  "Approved in client portal workspace",
                                ),
                              )
                            }
                          >
                            Approve
                          </Button>
                          <ReasonAction
                            label="Reject"
                            title="Reject submitted evidence?"
                            body={
                              <p>
                                Explain why “{item.latestResponse.filename}”
                                does not meet this request. The reason will be
                                recorded for the client.
                              </p>
                            }
                            reasonLabel="Reason for rejection"
                            confirmLabel="Reject evidence"
                            disabled={busy === `reject-${item.id}`}
                            onConfirm={(reason) =>
                              act(`reject-${item.id}`, () =>
                                api.reviewDocumentResponse(
                                  context,
                                  engagementId,
                                  item.id,
                                  item.latestResponse!.id,
                                  "REJECTED",
                                  reason,
                                ),
                              )
                            }
                          />
                        </>
                      )}
                      {item.status === "OPEN" && (
                        <ConfirmAction
                          label="Cancel"
                          title="Cancel document request?"
                          body={`The request “${item.title}” will be cancelled and can no longer receive a response.`}
                          confirmLabel="Cancel request"
                          appearance="subtle"
                          onConfirm={() =>
                            act(`cancel-${item.id}`, () =>
                              api.cancelDocumentRequest(
                                context,
                                engagementId,
                                item.id,
                                "Cancelled by staff in the accounts workspace",
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </section>
  );
}

function ImportCentre({ context, engagements, onOpenSource }: Props) {
  const [items, setItems] = useState<Integration[]>([]);
  const [runs, setRuns] = useState<Record<string, SyncRun[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("Standard nominal import");
  const [engagementId, setEngagementId] = useState(engagements[0]?.id || "");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<NormalizedImportPreview | null>(null);
  const [columnMapping, setColumnMapping] = useState<Partial<TrialBalanceColumnMapping>>({});
  const [mappingValidated, setMappingValidated] = useState(false);
  const [manualMapping, setManualMapping] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!engagements.some((item) => item.id === engagementId)) {
      setEngagementId(engagements[0]?.id || "");
      setPreview(null);
      setColumnMapping({});
      setMappingValidated(false);
      setManualMapping(false);
    }
  }, [engagementId, engagements]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.integrations(context);
      setItems(data.items);
      const histories = await Promise.all(
        data.items.map(
          async (item) =>
            [item.id, (await api.syncRuns(context, item.id)).items] as const,
        ),
      );
      setRuns(Object.fromEntries(histories));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context]);
  useEffect(() => {
    load();
  }, [load]);
  async function act(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function importPreviewedFile() {
    if (!file || !engagementId || !preview || !mappingValidated) return;
    setBusy("import");
    setError("");
    setNotice("");
    try {
      await api.importTrialBalance(
        context,
        engagementId,
        file,
        manualMapping ? columnMapping as TrialBalanceColumnMapping : undefined,
      );
      setNotice(`${file.name} was imported to the selected engagement.`);
      onOpenSource?.(engagementId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  const mappingFields: Array<{ field: TrialBalanceField; label: string }> = [
    { field: "accountCode", label: "Account code" },
    { field: "accountName", label: "Account name" },
    { field: "debit", label: "Debit" },
    { field: "credit", label: "Credit" },
  ];
  const completeMapping = mappingFields.every(({ field }) =>
    Number.isInteger(columnMapping[field]),
  );
  const uniqueMapping = new Set(Object.values(columnMapping)).size === mappingFields.length;
  async function applyColumnMapping() {
    if (!file || !engagementId || !completeMapping || !uniqueMapping) return;
    setBusy("mapping");
    setError("");
    try {
      const item = (
        await api.normalizeImport(
          context,
          engagementId,
          file,
          columnMapping as TrialBalanceColumnMapping,
        )
      ).item;
      setPreview(item);
      setMappingValidated(item.mappingComplete);
      setManualMapping(true);
    } catch (e) {
      setMappingValidated(false);
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  if (loading) return <LoadState label="Loading integrations" />;
  const selectedEngagement = engagements.find(
    (item) => item.id === engagementId,
  );
  const organisationId = selectedEngagement?.organisation_id || "";
  const previewReason = !engagementId
    ? "Select an engagement to preview a CSV file."
    : !file
      ? "Choose a CSV file to enable preview."
      : "";
  const saveConfigurationReason = !name.trim()
    ? "Enter a template name to save this configuration."
    : !organisationId
      ? "Select an engagement with a client organisation to save this configuration."
      : !preview
        ? "Preview a CSV file before saving this configuration."
        : "";
  return (
    <section className="commercial-page">
      <PageHead
        title="Imports and integrations"
        body="Normalise source files, reuse import configurations and inspect sync history."
      >
        <Button onClick={load}>Refresh</Button>
      </PageHead>
      {error && <Failure message={error} retry={load} />}
      {notice && (
        <MessageBar className="commercial-message" intent="success">
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      )}
      <section className="commercial-section">
        <header>
          <div>
            <h2>Import preview</h2>
            <p>Select an engagement and preview a CSV before importing it.</p>
          </div>
        </header>
        <form
          className="commercial-form import-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file || !engagementId) return;
            setBusy("preview");
            setError("");
            try {
              const item = (await api.normalizeImport(context, engagementId, file)).item;
              setPreview(item);
              setColumnMapping(item.suggestedMapping);
              setMappingValidated(item.mappingComplete);
              setManualMapping(false);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy("");
            }
          }}
        >
          <Field label="Engagement">
            <Select
              value={engagementId}
              onChange={(event) => setEngagementId(event.target.value)}
            >
              {engagements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legal_name} · {periodDate(item.period_end)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source file" required>
            <div className="file-picker">
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setPreview(null);
                  setColumnMapping({});
                  setMappingValidated(false);
                  setManualMapping(false);
                }}
              />
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                Choose file
              </Button>
              <span title={file?.name}>{file?.name || "No file selected"}</span>
            </div>
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={!file || !engagementId || busy === "preview"}
            disabledFocusable={Boolean(previewReason) && busy !== "preview"}
            aria-describedby={previewReason ? "import-preview-reason" : undefined}
          >
            Preview file
          </Button>
          {previewReason && (
            <small id="import-preview-reason" className="action-precondition">
              {previewReason}
            </small>
          )}
        </form>
        {preview && (
          <div className="import-preview">
            <div aria-live="polite">
              <b>{preview.rowCount} rows detected</b>
              <span>{preview.encoding} · {preview.headers.join(", ")}</span>
            </div>
            <section aria-labelledby="column-mapping-heading">
              <h3 id="column-mapping-heading">Column mapping</h3>
              <p>Confirm which source column supplies each required trial-balance field.</p>
              <div className="commercial-form import-mapping-form">
                {mappingFields.map(({ field, label }) => (
                  <Field key={field} label={label} required>
                    <Select
                      value={columnMapping[field]?.toString() ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setColumnMapping((current) => ({
                          ...current,
                          [field]: value === "" ? undefined : Number(value),
                        }));
                        setMappingValidated(false);
                        setManualMapping(true);
                      }}
                    >
                      <option value="">Choose a column</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>{header}</option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              {!uniqueMapping && completeMapping && (
                <MessageBar className="commercial-message" intent="error">
                  <MessageBarBody>Choose a different source column for each field.</MessageBarBody>
                </MessageBar>
              )}
              <Button
                type="button"
                disabled={!completeMapping || !uniqueMapping || busy === "mapping"}
                onClick={applyColumnMapping}
              >
                {busy === "mapping" ? "Applying mapping…" : "Apply column mapping"}
              </Button>
            </section>
            <div
              className="commercial-table"
              role="region"
              aria-label="Trial balance preview table"
              tabIndex={0}
            >
              <Table size="small" aria-label={mappingValidated ? "Mapped trial balance preview" : "Source CSV preview"}>
                <TableHeader>
                  <TableRow>
                    {(mappingValidated
                      ? ["Account code", "Account name", "Debit", "Credit"]
                      : preview.headers
                    ).map((header) => <TableHeaderCell key={header}>{header}</TableHeaderCell>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(mappingValidated ? preview.preview : preview.rawPreview).map((row, index) => (
                    <TableRow key={index}>
                      {(mappingValidated
                        ? [row.accountCode, row.accountName, row.debit, row.credit]
                        : preview.headers.map((header) => (row as unknown as Record<string, unknown>)[header])
                      ).map((value, column) => <TableCell key={column}>{String(value ?? "")}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {mappingValidated && (
              <p aria-live="polite">
                Debit {preview.debitTotal} · Credit {preview.creditTotal} · {preview.balanced ? "Balanced" : "Not balanced"}
              </p>
            )}
            <Button
              appearance="primary"
              disabled={!mappingValidated || preview.balanced !== true || busy === "import"}
              onClick={importPreviewedFile}
            >
              {busy === "import" ? "Importing…" : "Import trial balance"}
            </Button>
            {preview.warnings.map((warning) => (
              <MessageBar
                className="commercial-message"
                key={warning}
                intent="warning"
              >
                <MessageBarBody>{warning}</MessageBarBody>
              </MessageBar>
            ))}
          </div>
        )}
      </section>
      <section className="commercial-section">
        <header>
          <div>
            <h2>Saved import configurations</h2>
            <p>Save column and mapping choices for future CSV imports.</p>
          </div>
        </header>
        <form
          className="commercial-form integration-config-form"
          onSubmit={(event) => {
            event.preventDefault();
            act("create", () =>
              api.createIntegration(context, organisationId, name, {
                templateVersion: 1,
                sourceFileName: file?.name || null,
                detectedColumns: preview?.detectedColumns || [],
              }),
            );
          }}
        >
          <Field label="Template name">
            <Input value={name} onChange={(_, data) => setName(data.value)} />
          </Field>
          <Field label="Organisation">
            <Input
              readOnly
              value={selectedEngagement?.legal_name || "Select an engagement"}
            />
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={!name.trim() || !organisationId || !preview || busy === "create"}
            disabledFocusable={
              Boolean(saveConfigurationReason) && busy !== "create"
            }
            aria-describedby={
              saveConfigurationReason ? "save-configuration-reason" : undefined
            }
          >
            Save configuration
          </Button>
          {saveConfigurationReason && (
            <small
              id="save-configuration-reason"
              className="action-precondition"
            >
              {saveConfigurationReason}
            </small>
          )}
        </form>
        {!organisationId && (
          <MessageBar className="commercial-message" intent="warning">
            <MessageBarBody>
              The selected engagement does not expose its organisation ID, so a
              saved CSV configuration cannot be created here.
            </MessageBarBody>
          </MessageBar>
        )}
        <div className="commercial-table">
          <Table size="small" aria-label="Saved import configurations">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Format</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Last sync</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const latest = runs[item.id]?.[0];
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <b>{item.displayName}</b>
                      <small>Updated {when(item.updatedAt)}</small>
                    </TableCell>
                    <TableCell>{readable(item.connectorCode)}</TableCell>
                    <TableCell>
                      <Badge {...statusBadgeProps(item.status)}>
                        {readable(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {latest ? (
                        <>
                          <Badge {...statusBadgeProps(latest.status)}>
                            {readable(latest.status)}
                          </Badge>
                          <small>
                            {latest.errorSummary ||
                              when(latest.completedAt || latest.startedAt)}
                          </small>
                        </>
                      ) : (
                        "No runs"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="row-actions">
                        <Button
                          size="small"
                          appearance="secondary"
                          disabled
                          disabledFocusable
                          aria-describedby={`sync-unavailable-${item.id}`}
                        >
                          Run sync
                        </Button>
                        <Button
                          size="small"
                          appearance="subtle"
                          onClick={() =>
                            act(`toggle-${item.id}`, () =>
                              api.updateIntegration(context, item.id, {
                                status:
                                  item.status === "DISABLED"
                                    ? "CONFIGURED"
                                    : "DISABLED",
                              }),
                            )
                          }
                        >
                          {item.status === "DISABLED" ? "Enable" : "Disable"}
                        </Button>
                      </div>
                      <small
                        id={`sync-unavailable-${item.id}`}
                        className="action-precondition"
                      >
                        Sync is unavailable until connector execution is enabled.
                      </small>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="commercial-section">
        <header>
          <div>
            <h2>Accounting connectors</h2>
            <p>Direct accounting-system connections are not enabled for this workspace.</p>
          </div>
        </header>
        <MessageBar className="commercial-message" intent="info">
          <MessageBarBody>
            Use CSV import above. Xero, Sage and QuickBooks Online connections will only appear here when enabled by an administrator.
          </MessageBarBody>
        </MessageBar>
      </section>
    </section>
  );
}

function Inbox({ context }: Props) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"" | "UNREAD" | "READ">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await api.notifications(context, filter || undefined)).items);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, filter]);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <LoadState label="Loading notifications" />;
  return (
    <section className="commercial-page">
      <PageHead
        title="Inbox"
        body="Workspace events that need attention or confirm a completed action."
      >
        <Field label="Status">
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="">All</option>
            <option value="UNREAD">Unread</option>
            <option value="READ">Read</option>
          </Select>
        </Field>
      </PageHead>
      {error && <Failure message={error} retry={load} />}
      <div
        className="inbox-list"
        role="feed"
        aria-label="Workspace notifications"
      >
        {items.length ? (
          items.map((item) => (
            <article key={item.id} aria-label={item.title}>
              <div>
                <header>
                  <b>{item.title}</b>
                  <Badge {...statusBadgeProps(item.severity)}>
                    {readable(item.severity)}
                  </Badge>
                </header>
                <p>{item.message}</p>
                <small>
                  {when(item.createdAt)} · {readable(item.type)}
                </small>
              </div>
              {item.status === "UNREAD" && (
                <Button
                  size="small"
                  onClick={async () => {
                    await api.markNotificationRead(context, item.id);
                    await load();
                  }}
                >
                  Mark read
                </Button>
              )}
            </article>
          ))
        ) : (
          <div className="commercial-empty" role="status">
            <b>{inboxEmptyMessage(filter)}</b>
            <span>New workspace notifications will appear here.</span>
          </div>
        )}
      </div>
      <Accordion className="delivery-status" collapsible>
        <AccordionItem value="delivery-capabilities">
          <AccordionHeader>
            <span className="delivery-status-heading">
              <b>Delivery capabilities</b>
              <small>Technical availability for workspace notifications.</small>
            </span>
          </AccordionHeader>
          <AccordionPanel>
            <Table size="small" aria-label="Notification delivery capabilities">
              <TableBody>
                <TableRow>
                  <TableCell>In-app inbox</TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps("AVAILABLE")}>Available</Badge>
                  </TableCell>
                  <TableCell>
                    Stored workspace notifications and read status.
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Email publisher</TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps("NOT_CONFIGURED")}>
                      Not configured
                    </Badge>
                  </TableCell>
                  <TableCell>
                    Scheduled worker and delivery retry visibility remain internal.
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Dead-letter queue</TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps("RESTRICTED")}>Restricted</Badge>
                  </TableCell>
                  <TableCell>No public retry or DLQ action is exposed.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function WorkspaceSettings({ context, engagements }: Props) {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [exports, setExports] = useState<ExportRequest[]>([]);
  const [exportCapability, setExportCapability] =
    useState<ExportCapability | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [engagementId, setEngagementId] = useState(engagements[0]?.id || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsData, exportData] = await Promise.all([
        api.tenantSettings(context),
        api.exportRequests(context),
      ]);
      setSettings(settingsData.item);
      setName(settingsData.item.name);
      setExports(exportData.items);
      setExportCapability(exportData.capability || null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context]);
  useEffect(() => {
    load();
  }, [load]);
  async function act(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  if (loading) return <LoadState label="Loading workspace settings" />;
  if (!settings)
    return (
      <Failure message={error || "Settings are unavailable."} retry={load} />
    );
  return (
    <section className="commercial-page">
      <PageHead
        title="Workspace settings"
        body="Workspace identity, controlled exports and lifecycle requests."
      >
        <Badge {...statusBadgeProps(settings.lifecycleStatus)}>
          {readable(settings.lifecycleStatus)}
        </Badge>
      </PageHead>
      {error && <Failure message={error} retry={load} />}
      <section className="commercial-section">
        <header>
          <div>
            <h2>Workspace identity</h2>
            <p>The workspace name appears in navigation and audit context.</p>
          </div>
        </header>
        <form
          className="commercial-form"
          onSubmit={(event) => {
            event.preventDefault();
            act("name", () => api.updateTenantSettings(context, name));
          }}
        >
          <Field label="Workspace name">
            <Input
              value={name}
              maxLength={160}
              onChange={(_, data) => setName(data.value)}
            />
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={!name.trim() || name === settings.name || busy === "name"}
          >
            Save name
          </Button>
        </form>
      </section>
      <section className="commercial-section">
        <header>
          <div>
            <h2>Data exports</h2>
            <p>
              Export requests are recorded as ZIP jobs. Generation is disabled
              until the export runner is provisioned.
            </p>
          </div>
        </header>
        <div className="commercial-form">
          <Field label="Engagement scope">
            <Select
              value={engagementId}
              onChange={(event) => setEngagementId(event.target.value)}
            >
              <option value="">Entire tenant</option>
              {engagements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legal_name} · {periodDate(item.period_end)}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            onClick={() =>
              act("export", () =>
                api.createExportRequest(context, {
                  scope: engagementId ? "ENGAGEMENT" : "TENANT",
                  ...(engagementId ? { engagementId } : {}),
                  idempotencyKey: crypto.randomUUID(),
                }),
              )
            }
          >
            Request ZIP export
          </Button>
        </div>
        {exportCapability?.generationAvailable === false && (
          <MessageBar className="commercial-message" intent="warning">
            <MessageBarBody>
              {exportCapability.message ||
                "Export generation is not available in this environment."}
            </MessageBarBody>
          </MessageBar>
        )}
        <div
          className="commercial-table"
          role="region"
          aria-label="Scrollable data export requests"
          tabIndex={0}
        >
          <Table size="small" aria-label="Data export requests">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Scope</TableHeaderCell>
                <TableHeaderCell>Requested</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Output</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exports.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{readable(item.scope)}</TableCell>
                  <TableCell>{when(item.requestedAt)}</TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps(item.status)}>
                      {readable(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.status === "READY" && item.downloadPath ? (
                      <span>Authenticated download available</span>
                    ) : (
                      "No output available"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="commercial-section danger-zone">
        <header>
          <div>
            <h2>Workspace lifecycle</h2>
            <p>
              Suspension changes access immediately. Closure enters a controlled
              request state.
            </p>
          </div>
        </header>
        <Field className="danger-zone-reason" label="Business reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(_, data) => setReason(data.value)}
          />
        </Field>
        <div className="row-actions">
          <ConfirmAction
            label="Suspend workspace"
            title="Suspend workspace?"
            body="Workspace access will be suspended immediately."
            confirmLabel="Suspend workspace"
            disabled={!reason.trim() || busy === "SUSPENDED"}
            onConfirm={() =>
              act("SUSPENDED", () =>
                api.updateTenantLifecycle(context, "SUSPENDED", reason),
              )
            }
          />
          <ConfirmAction
            label="Request closure"
            title="Request workspace closure?"
            body="This submits a controlled closure request for administrative approval."
            confirmLabel="Request closure"
            appearance="secondary"
            disabled={!reason.trim() || busy === "CLOSURE_REQUESTED"}
            onConfirm={() =>
              act("CLOSURE_REQUESTED", () =>
                api.updateTenantLifecycle(context, "CLOSURE_REQUESTED", reason),
              )
            }
          />
        </div>
      </section>
    </section>
  );
}
