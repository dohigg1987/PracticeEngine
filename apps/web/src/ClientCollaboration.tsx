import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  createTableColumn,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Tab,
  TabList,
  Textarea,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  CheckmarkRegular,
  SendRegular,
} from "@fluentui/react-icons";
import {
  api,
  ApiContext,
  ClientRequestItem,
  PortalContact,
  PortalDocumentItem,
  PortalMessageItem,
  PortalThreadItem,
} from "./api";
import { formatDate, formatDateTime } from "./displayFormat";
import { statutoryLabel } from "./format";
import { statusBadgeProps } from "./statusBadge";
import "./client-collaboration.css";

type StaffTab = "requests" | "documents" | "messages" | "access";
type PortalTab = "home" | "requests" | "documents" | "messages";
type RequestDetail = ClientRequestItem & { responses?: Record<string, unknown>[]; documents?: PortalDocumentItem[] };

export function requestNeedsAction(item: ClientRequestItem): boolean {
  return ["open", "viewed", "partially_complete"].includes(item.status);
}

export function clientRequestDueLabel(item: ClientRequestItem, now = new Date()): string {
  if (!item.due_at) return "No due date";
  const due = new Date(item.due_at);
  if (Number.isNaN(due.valueOf())) return "Due date unavailable";
  if (requestNeedsAction(item) && due.valueOf() < now.valueOf()) return `Overdue · ${formatDate(item.due_at)}`;
  return formatDate(item.due_at);
}

export function documentsFromRequests(items: RequestDetail[]): PortalDocumentItem[] {
  const seen = new Set<string>();
  return items.flatMap((item) => item.documents ?? []).filter((document) => {
    if (seen.has(document.id)) return false;
    seen.add(document.id);
    return true;
  });
}

function Status({ value }: { value: string }) {
  return <Badge {...statusBadgeProps(value)}>{statutoryLabel(value)}</Badge>;
}

function Loading({ label }: { label: string }) {
  return <Skeleton className="collaboration-loading" role="status" aria-label={label}><SkeletonItem size={24} /><SkeletonItem /><SkeletonItem /><SkeletonItem /></Skeleton>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="collaboration-empty"><h3>{title}</h3><p>{body}</p></div>;
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody><Button appearance="transparent" onClick={retry}>Retry</Button></MessageBar>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The collaboration service could not be reached.";
}

const requestColumns: TableColumnDefinition<ClientRequestItem>[] = [
  createTableColumn({ columnId: "client", compare: (a, b) => (a.client_name ?? "").localeCompare(b.client_name ?? ""), renderHeaderCell: () => "Client", renderCell: (item) => item.client_name || "Client" }),
  createTableColumn({ columnId: "request", compare: (a, b) => a.title.localeCompare(b.title), renderHeaderCell: () => "Request", renderCell: (item) => <span className="collaboration-primary-cell"><strong>{item.title}</strong><small>{statutoryLabel(item.request_type)}</small></span> }),
  createTableColumn({ columnId: "context", compare: (a, b) => (a.engagement_name ?? a.work_title ?? "").localeCompare(b.engagement_name ?? b.work_title ?? ""), renderHeaderCell: () => "Engagement / work", renderCell: (item) => item.work_title || item.engagement_name || "General" }),
  createTableColumn({ columnId: "recipient", renderHeaderCell: () => "Recipient", renderCell: () => "Client contact" }),
  createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Status", renderCell: (item) => <Status value={item.status} /> }),
  createTableColumn({ columnId: "due", compare: (a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""), renderHeaderCell: () => "Due", renderCell: (item) => <span className={clientRequestDueLabel(item).startsWith("Overdue") ? "collaboration-overdue" : undefined}>{clientRequestDueLabel(item)}</span> }),
  createTableColumn({ columnId: "owner", renderHeaderCell: () => "Owner", renderCell: (item) => item.responsible_member_id ? "Assigned" : "Unassigned" }),
  createTableColumn({ columnId: "response", compare: (a, b) => (a.last_response_at ?? "").localeCompare(b.last_response_at ?? ""), renderHeaderCell: () => "Last response", renderCell: (item) => item.last_response_at ? formatDateTime(item.last_response_at) : "No response" }),
];

function RequestsGrid({ items, onOpen, portal = false }: { items: ClientRequestItem[]; onOpen: (item: ClientRequestItem) => void; portal?: boolean }) {
  const columns = portal ? requestColumns.filter((column) => !["client", "recipient", "owner"].includes(String(column.columnId))) : requestColumns;
  if (!items.length) return <Empty title={portal ? "You are all caught up" : "No client requests"} body={portal ? "There are no requests to respond to." : "Requests will appear here when the practice asks a client for information, evidence or confirmation."} />;
  return <div className="collaboration-grid"><DataGrid items={items} columns={columns} sortable getRowId={(item) => item.id} aria-label={portal ? "Your requests" : "Client requests"}><DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DataGridBody<ClientRequestItem>>{({ item, rowId }) => <DataGridRow<ClientRequestItem> key={rowId}>{({ renderCell, columnId }) => <DataGridCell>{columnId === "request" ? <Button appearance="transparent" className="collaboration-link" onClick={() => onOpen(item)}>{renderCell(item)}</Button> : renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody></DataGrid></div>;
}

function DocumentsList({ items, context, allowDownload }: { items: PortalDocumentItem[]; context: ApiContext; allowDownload: boolean }) {
  async function download(item: PortalDocumentItem) {
    const blob = await api.clientPortalDocumentBlob(context, item.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.display_filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  if (!items.length) return <Empty title="No shared documents" body="Documents shared with you, or uploaded in response to a request, will appear here." />;
  return <div className="collaboration-table-scroll"><table className="collaboration-table"><thead><tr><th>Name</th><th>Type</th><th>Context</th><th>Version</th><th>Provided</th>{allowDownload && <th>Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.display_filename}</strong></td><td>{item.media_type || "Document"}</td><td>{item.client_request_id ? "Client request" : "General"}</td><td>{item.current_version}</td><td>{item.version_created_at ? formatDateTime(item.version_created_at) : "Not available"}</td>{allowDownload && <td><Button size="small" icon={<ArrowDownloadRegular />} onClick={() => void download(item)}>Download</Button></td>}</tr>)}</tbody></table></div>;
}

function StaffWorkspace({ context, clientId, engagementIds = [] }: { context: ApiContext; clientId?: string; engagementIds?: string[] }) {
  const [tab, setTab] = useState<StaffTab>("requests");
  const [requests, setRequests] = useState<ClientRequestItem[]>([]);
  const [details, setDetails] = useState<RequestDetail[]>([]);
  const [threads, setThreads] = useState<PortalThreadItem[]>([]);
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [requestData, threadData, contactData] = await Promise.all([
        api.clientRequests(context),
        api.portalThreads(context),
        Promise.all(engagementIds.map((id) => api.portalContacts(context, id).then((result) => result.items))).then((groups) => groups.flat()),
      ]);
      const visibleRequests = clientId ? requestData.items.filter((item) => item.client_id === clientId) : requestData.items;
      const visibleThreads = clientId ? threadData.items.filter((item) => item.client_id === clientId) : threadData.items;
      setRequests(visibleRequests); setThreads(visibleThreads); setContacts(contactData);
      const detailItems = await Promise.all(visibleRequests.map((item) => api.clientRequest(context, item.id).then((result) => result.item as RequestDetail)));
      setDetails(detailItems);
    } catch (error) { setError(errorText(error)); } finally { setLoading(false); }
  }, [clientId, context, engagementIds.join("|")]);
  useEffect(() => { void load(); }, [load]);
  async function complete() { if (!selected) return; setBusy(true); try { await api.completeClientRequest(context, selected.id); setSelected(null); await load(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  if (loading) return <Loading label="Loading client collaboration" />;
  const documents = documentsFromRequests(details);
  return <section className="collaboration-page"><header className="collaboration-head"><div><h1>{clientId ? "Client collaboration" : "Client requests"}</h1><p>{clientId ? "Portal access, requests, documents and secure communications for this client." : "Track information, evidence and actions requested from clients."}</p></div></header>{error && <Failure message={error} retry={load} />}<TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value as StaffTab)}><Tab value="requests">Requests</Tab><Tab value="documents">Documents</Tab><Tab value="messages">Messages</Tab><Tab value="access">Portal access</Tab></TabList>
    {tab === "requests" && <RequestsGrid items={requests} onOpen={(item) => setSelected(details.find((detail) => detail.id === item.id) ?? item)} />}
    {tab === "documents" && <DocumentsList items={documents} context={context} allowDownload={false} />}
    {tab === "messages" && (threads.length ? <ul className="thread-list">{threads.map((thread) => <li key={thread.id}><span><strong>{thread.subject}</strong><small>{thread.client_name || "Client"} · {thread.last_message_at ? formatDateTime(thread.last_message_at) : "No messages yet"}</small></span><Status value={thread.status} /></li>)}</ul> : <Empty title="No secure messages" body="Secure client conversations will appear here when a thread is opened." />)}
    {tab === "access" && (contacts.length ? <div className="collaboration-table-scroll"><table className="collaboration-table"><thead><tr><th>Contact</th><th>Email</th><th>Role</th><th>Access</th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td>{contact.displayName}</td><td>{contact.email}</td><td>{statutoryLabel(contact.accessRole)}</td><td><Status value={contact.accessStatus} /></td></tr>)}</tbody></table></div> : <Empty title="No portal contacts" body={engagementIds.length ? "Invite an authorised client contact from the engagement portal-access area." : "Portal contacts are managed against a client engagement."} />)}
    {selected && <section className="request-detail" aria-label="Request detail"><header><div><h2>{selected.title}</h2><p>{selected.engagement_name || selected.work_title || "General client request"}</p></div><Status value={selected.status} /></header><p>{selected.description || "No further instructions were supplied."}</p><dl><div><dt>Type</dt><dd>{statutoryLabel(selected.request_type)}</dd></div><div><dt>Due</dt><dd>{clientRequestDueLabel(selected)}</dd></div><div><dt>Responses</dt><dd>{selected.responses?.length ?? selected.response_count ?? 0}</dd></div><div><dt>Completion</dt><dd>{statutoryLabel(selected.completion_mode || "manual")}</dd></div></dl><div className="request-actions"><Button onClick={() => setSelected(null)}>Close</Button>{!["completed", "cancelled"].includes(selected.status) && <Button appearance="primary" icon={<CheckmarkRegular />} disabled={busy} onClick={() => void complete()}>Confirm complete</Button>}</div></section>}
  </section>;
}

function PortalRequestDetail({ context, item, onClose, onChanged }: { context: ApiContext; item: ClientRequestItem; onClose: () => void; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(""); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  async function respond(responseType: "text" | "confirmation", value?: boolean) { setBusy(true); setError(""); try { await api.respondToClientRequest(context, item.id, { responseType, text: responseType === "text" ? text.trim() : undefined, value, idempotencyKey: crypto.randomUUID() }); setText(""); await onChanged(); onClose(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  async function upload() { if (!file) return; setBusy(true); setError(""); try { await api.uploadClientRequestDocument(context, item.id, file, crypto.randomUUID()); setFile(null); await onChanged(); onClose(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  return <section className="portal-request-detail"><header><div><h2>{item.title}</h2><p>{item.engagement_name || item.work_title || "General request"}</p></div><Status value={item.status} /></header>{error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}<p>{item.description || "Your practice has not supplied additional instructions."}</p><dl><div><dt>Action</dt><dd>{statutoryLabel(item.request_type)}</dd></div><div><dt>Due</dt><dd>{clientRequestDueLabel(item)}</dd></div></dl>
    {item.request_type === "confirmation" || item.request_type === "approval" ? <div className="request-actions"><Button disabled={busy} onClick={() => void respond("confirmation", false)}>Decline</Button><Button appearance="primary" icon={<CheckmarkRegular />} disabled={busy} onClick={() => void respond("confirmation", true)}>Confirm</Button></div> : <><Field label="Your response"><Textarea resize="vertical" value={text} onChange={(_, data) => setText(data.value)} /></Field><div className="request-actions"><Button onClick={onClose}>Cancel</Button><Button appearance="primary" icon={<SendRegular />} disabled={busy || !text.trim()} onClick={() => void respond("text")}>Send response</Button></div></>}
    {item.request_type === "document" && <div className="upload-row"><input ref={fileRef} className="sr-only" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button icon={<ArrowUploadRegular />} onClick={() => fileRef.current?.click()}>Choose document</Button><span>{file?.name || "No document selected"}</span><Button appearance="primary" disabled={busy || !file} onClick={() => void upload()}>Upload securely</Button></div>}
  </section>;
}

function MessageThread({ context, thread, onChanged }: { context: ApiContext; thread: PortalThreadItem; onChanged: () => Promise<void> }) {
  const [messages, setMessages] = useState<PortalMessageItem[]>([]); const [body, setBody] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(true);
  const load = useCallback(async () => { setBusy(true); try { setMessages((await api.clientPortalThread(context, thread.id)).messages); setError(""); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }, [context, thread.id]);
  useEffect(() => { void load(); }, [load]);
  async function send() { setBusy(true); try { await api.sendClientPortalMessage(context, thread.id, body.trim(), crypto.randomUUID()); setBody(""); await Promise.all([load(), onChanged()]); } catch (error) { setError(errorText(error)); setBusy(false); } }
  return <section className="message-thread"><header><h2>{thread.subject}</h2><Status value={thread.status} /></header>{error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}{busy && !messages.length ? <Loading label="Loading messages" /> : <ol>{messages.map((message) => <li key={message.id} className={message.sender_context === "portal" ? "from-client" : undefined}><strong>{message.sender_context === "portal" ? "You" : "Your practice"}</strong><p>{message.body}</p><small>{formatDateTime(message.sent_at)}</small></li>)}</ol>}<Field label="Reply"><Textarea resize="vertical" value={body} disabled={thread.status !== "open"} onChange={(_, data) => setBody(data.value)} /></Field><Button appearance="primary" icon={<SendRegular />} disabled={busy || thread.status !== "open" || !body.trim()} onClick={() => void send()}>Send securely</Button></section>;
}

function PortalWorkspace({ context }: { context: ApiContext }) {
  const [tab, setTab] = useState<PortalTab>("home"); const [requests, setRequests] = useState<ClientRequestItem[]>([]); const [documents, setDocuments] = useState<PortalDocumentItem[]>([]); const [threads, setThreads] = useState<PortalThreadItem[]>([]); const [selectedRequest, setSelectedRequest] = useState<ClientRequestItem | null>(null); const [selectedThread, setSelectedThread] = useState<PortalThreadItem | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [requestData, documentData, threadData] = await Promise.all([api.clientPortalRequests(context), api.clientPortalDocuments(context), api.clientPortalThreads(context)]); setRequests(requestData.items); setDocuments(documentData.items); setThreads(threadData.items); } catch (error) { setError(errorText(error)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const outstanding = useMemo(() => requests.filter(requestNeedsAction), [requests]);
  if (loading) return <Loading label="Loading client portal" />;
  return <section className="collaboration-page portal-page"><header className="collaboration-head"><div><h1>Client portal</h1><p>Requests, documents and secure messages from your practice.</p></div></header>{error && <Failure message={error} retry={load} />}<TabList selectedValue={tab} onTabSelect={(_, data) => { setTab(data.value as PortalTab); setSelectedRequest(null); setSelectedThread(null); }}><Tab value="home">Home</Tab><Tab value="requests">Requests</Tab><Tab value="documents">Documents</Tab><Tab value="messages">Messages</Tab></TabList>
    {tab === "home" && <div className="portal-home"><section><header><h2>Actions required</h2><span>{outstanding.length}</span></header><RequestsGrid items={outstanding.slice(0, 5)} portal onOpen={(item) => { setTab("requests"); setSelectedRequest(item); }} /></section><section><header><h2>Recent messages</h2></header>{threads.length ? <ul className="thread-list">{threads.slice(0, 4).map((thread) => <li key={thread.id}><Button appearance="transparent" className="collaboration-link" onClick={() => { setTab("messages"); setSelectedThread(thread); }}><span><strong>{thread.subject}</strong><small>{thread.last_message_at ? formatDateTime(thread.last_message_at) : "No messages yet"}</small></span></Button></li>)}</ul> : <Empty title="No messages" body="Secure messages from your practice will appear here." />}</section></div>}
    {tab === "requests" && (selectedRequest ? <PortalRequestDetail context={context} item={selectedRequest} onClose={() => setSelectedRequest(null)} onChanged={load} /> : <RequestsGrid items={requests} portal onOpen={setSelectedRequest} />)}
    {tab === "documents" && <DocumentsList items={documents.filter((item) => item.visibility !== "internal" && item.visibility !== "restricted")} context={context} allowDownload />}
    {tab === "messages" && (selectedThread ? <MessageThread context={context} thread={selectedThread} onChanged={load} /> : threads.length ? <ul className="thread-list">{threads.map((thread) => <li key={thread.id}><Button appearance="transparent" className="collaboration-link" onClick={() => setSelectedThread(thread)}><span><strong>{thread.subject}</strong><small>{thread.last_message_at ? formatDateTime(thread.last_message_at) : "No messages yet"}</small></span><Status value={thread.status} /></Button></li>)}</ul> : <Empty title="No secure messages" body="Messages from your practice will appear here." />)}
  </section>;
}

export default function ClientCollaboration({ context, mode = "staff", clientId, engagementIds }: { context: ApiContext; mode?: "staff" | "portal"; clientId?: string; engagementIds?: string[] }) {
  return mode === "portal" ? <PortalWorkspace context={context} /> : <StaffWorkspace context={context} clientId={clientId} engagementIds={engagementIds} />;
}
