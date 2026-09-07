import ActivateClientServiceDialog from "./ActivateClientServiceDialog";
import React, { useEffect, useRef, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface,
  DialogTitle, Field, Input, MessageBar, MessageBarBody, Select, Spinner, makeStyles, tokens, useRestoreFocusSource,
} from "@fluentui/react-components";
import { api, type ApiContext, type Organisation, type PracticeClientSummary } from "./api";

const useStyles = makeStyles({
  form: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
});
type Props = {
  context: ApiContext;
  summary?: PracticeClientSummary;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
};
const message = (error: unknown) => error instanceof Error ? error.message : "Work could not be created.";

export default function CreatePracticeWorkDialog({ context, summary: initialSummary, onClose, onCreated }: Props) {
  const styles = useStyles();
  const restoreFocusSource = useRestoreFocusSource();
  const [addingService, setAddingService] = useState(false);
  const [clients, setClients] = useState<Organisation[]>([]);
  const [clientId, setClientId] = useState(initialSummary?.client.id || "");
  const [summary, setSummary] = useState(initialSummary);
  const [serviceId, setServiceId] = useState(initialSummary?.services.find(item => item.status === "active")?.id || "");
  const [engagementId, setEngagementId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(!initialSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    if (initialSummary) return;
    let active = true;
    setLoading(true); setError(""); setSummary(undefined);
    const load = async () => {
      try {
        if (!clientId) {
          const result = await api.organisations(context);
          if (active) setClients(result.items);
        } else {
          const result = await api.practiceClientSummary(context, clientId);
          if (active) {
            setSummary(result);
            setServiceId(result.services.find(item => item.status === "active")?.id || "");
          }
        }
      } catch (reason) { if (active) setError(message(reason)); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [context, clientId, initialSummary, attempt]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || loading || !summary || !title.trim() || !serviceId) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const result = await api.createPracticeWork(context, {
        clientId: summary.client.id, clientServiceId: serviceId,
        engagementId: engagementId || undefined, title: title.trim(),
        dueDate: dueDate || undefined, status: "not_started", priority: "normal",
      });
      await onCreated(result.item.id);
    } catch (reason) { setError(message(reason)); }
    finally { saving.current = false; setBusy(false); }
  }

  const activeServices = summary?.services.filter(item => item.status === "active") || [];
  if (addingService && summary) return <ActivateClientServiceDialog context={context} clientId={summary.client.id} existing={summary.services} onClose={() => setAddingService(false)} onCreated={async () => { const next = await api.practiceClientSummary(context, summary.client.id); setSummary(next); setServiceId(next.services.find(item => item.status === "active")?.id || ""); setAddingService(false); }} />;
  return <Dialog open onOpenChange={(_, data) => { if (!data.open && !saving.current) onClose(); }}>
    <DialogSurface {...restoreFocusSource}><form onSubmit={event => void create(event)}><DialogBody>
      <DialogTitle>Add work</DialogTitle>
      <DialogContent className={styles.form}>
        {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody>
          {!summary && <Button appearance="transparent" onClick={() => setAttempt(value => value + 1)}>Retry</Button>}
        </MessageBar>}
        {!initialSummary && <Field label="Client" required>
          <Select value={clientId} disabled={busy} onChange={(_, data) => {
            setClientId(data.value); setSummary(undefined); setServiceId(""); setEngagementId("");
          }}>
            <option value="">Select client</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.legal_name}</option>)}
          </Select>
        </Field>}
        {loading && <Spinner size="tiny" label="Loading client services" />}
        {summary && !activeServices.length && <MessageBar intent="info"><MessageBarBody>This client needs an active service before work can be added.</MessageBarBody><Button onClick={() => setAddingService(true)}>Add client service</Button></MessageBar>}
        <Field label="Service" required>
          <Select value={serviceId} disabled={busy || loading || !activeServices.length} onChange={(_, data) => setServiceId(data.value)}>
            <option value="">Select service</option>
            {activeServices.map(service => <option key={service.id} value={service.id}>{service.service_name || "Service"}</option>)}
          </Select>
        </Field>
        <Field label="Engagement" hint="Optional. Choose the engagement this work belongs to.">
          <Select value={engagementId} disabled={busy || loading || !summary} onChange={(_, data) => setEngagementId(data.value)}>
            <option value="">No engagement</option>
            {summary?.engagements.filter(item => item.status === "active").map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Work title" required><Input required maxLength={160} value={title} disabled={busy} onChange={(_, data) => setTitle(data.value)} /></Field>
        <Field label="Due date"><Input type="date" value={dueDate} disabled={busy} onChange={(_, data) => setDueDate(data.value)} /></Field>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" appearance="primary" disabled={busy || loading || !serviceId || !title.trim()}>{busy ? "Adding…" : "Add work"}</Button></DialogActions>
    </DialogBody></form></DialogSurface>
  </Dialog>;
}
