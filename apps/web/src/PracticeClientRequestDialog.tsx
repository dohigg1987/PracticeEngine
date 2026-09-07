import React, { useEffect, useState } from "react";
import { useRestoreFocusSource, Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Select, Spinner, Textarea } from "@fluentui/react-components";
import { api, type ApiContext, type ClientRequestRecipient, type CreateClientRequestInput, type PracticeWorkItem } from "./api";
import "./practice-delivery.css";

import { eligibleRequestRecipients } from "./practice-delivery";
export default function PracticeClientRequestDialog({ context, clientId, work, onClose, onCreated }: {
  context: ApiContext; clientId: string; work?: PracticeWorkItem; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const restoreFocusSource = useRestoreFocusSource();
  const [recipients, setRecipients] = useState<ClientRequestRecipient[]>([]);
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState(work ? `Information needed for ${work.title}` : "");
  const [description, setDescription] = useState("");
  const [requestType, setRequestType] = useState<CreateClientRequestInput["requestType"]>("information");
  const [due, setDue] = useState(work?.due_date || "");
  const [waiting, setWaiting] = useState(Boolean(work));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(""); setRecipient("");
    void api.clientRequestRecipients(context, clientId).then(result => {
      if (live) setRecipients(eligibleRequestRecipients(result.items, work));
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : "Client recipients could not be loaded."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [context, clientId, work?.engagement_id, work?.client_service_id, revision]);
  async function send() {
    setBusy(true); setError("");
    try {
      await api.createClientRequest(context, {
        clientId, workItemId: work?.id, engagementId: work?.engagement_id || undefined,
        recipientAccessIds: [recipient], title: title.trim(), description: description.trim() || undefined,
        requestType, dueAt: due ? `${due}T17:00:00.000Z` : undefined, send: true, waitingOnClient: Boolean(work && waiting),
      });
      await onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The request could not be sent."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(_, data) => { if (!data.open && !busy) onClose(); }}>
    <DialogSurface {...restoreFocusSource}><DialogBody><DialogTitle>Request from client</DialogTitle>
      <DialogContent className="pd-form">
        <p>Tell your client exactly what you need. The request will be sent to the selected portal contact.</p>
        {loading && <Spinner size="tiny" label="Loading client recipients" />}
        {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody><Button appearance="transparent" onClick={() => setRevision(value => value + 1)}>Retry recipients</Button></MessageBar>}
        {!loading && !error && !recipients.length && <MessageBar intent="warning"><MessageBarBody>No active or invited contact has access to this request's client and service. Configure the client's portal access before sending.</MessageBarBody></MessageBar>}
        <Field label="Recipient" required><Select disabled={loading || busy} value={recipient} onChange={(_, data) => setRecipient(data.value)}><option value="">Choose a client contact</option>{recipients.map(item => <option key={item.id} value={item.id}>{item.display_name} · {item.email_normalized}</option>)}</Select></Field>
        <Field label="Request type"><Select disabled={busy} value={requestType} onChange={(_, data) => setRequestType(data.value as CreateClientRequestInput["requestType"])}>{["information", "document", "confirmation", "approval"].map(value => <option key={value} value={value}>{value[0]!.toUpperCase() + value.slice(1)}</option>)}</Select></Field>
        <Field label="Request" required><Input maxLength={240} disabled={busy} value={title} onChange={(_, data) => setTitle(data.value)} /></Field>
        <Field label="Instructions"><Textarea disabled={busy} value={description} onChange={(_, data) => setDescription(data.value)} resize="vertical" /></Field>
        <Field label="Due date"><Input type="date" disabled={busy} value={due} onChange={(_, data) => setDue(data.value)} /></Field>
        {work && <Checkbox checked={waiting} disabled={busy} onChange={(_, data) => setWaiting(data.checked === true)} label="Mark this work as waiting on the client" />}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button appearance="primary" disabled={busy || loading || !recipient || !title.trim()} onClick={() => void send()}>{busy ? "Sending…" : "Send request"}</Button></DialogActions>
    </DialogBody></DialogSurface>
  </Dialog>;
}
