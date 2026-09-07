import React, { useEffect, useState } from "react";
import { useRestoreFocusSource, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Select, Spinner } from "@fluentui/react-components";
import { api, type ApiContext, type ClientService, type PracticeService } from "./api";
import "./practice-delivery.css";

export default function ActivateClientServiceDialog({ context, clientId, existing, onClose, onCreated }: {
  context: ApiContext; clientId: string; existing: ClientService[]; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const restoreFocusSource = useRestoreFocusSource();
  const [services, setServices] = useState<PracticeService[]>([]), [serviceId, setServiceId] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let live = true; void api.practiceServices(context).then(result => { if (live) setServices(result.items.filter(service => service.status === "active" && !existing.some(item => item.service_id === service.id && item.status === "active"))); }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : "Services could not be loaded."); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [context, existing]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!serviceId || !start || busy) return;
    setBusy(true); setError("");
    try { await api.activateClientService(context, clientId, { serviceId, startDate: start, frequency: frequency || undefined }); await onCreated(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The service could not be activated."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(_, data) => { if (!data.open && !busy) onClose(); }}><DialogSurface {...restoreFocusSource}><form onSubmit={event => void save(event)}><DialogBody><DialogTitle>Add client service</DialogTitle><DialogContent className="pd-form">
    <p>Choose the service this client has agreed to receive. You can then create work for it.</p>
    {loading && <Spinner size="tiny" label="Loading services" />}
    {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {!loading && !error && !services.length && <p>All active services are already assigned, or the service catalogue is empty. Manage the catalogue in Settings → Services.</p>}
    <Field label="Service" required><Select value={serviceId} disabled={busy || loading} onChange={(_, data) => { setServiceId(data.value); setFrequency(services.find(service => service.id === data.value)?.default_frequency || ""); }}><option value="">Choose service</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</Select></Field>
    <Field label="Start date" required><Input type="date" disabled={busy} value={start} onChange={(_, data) => setStart(data.value)} /></Field>
    <Field label="Frequency"><Select disabled={busy} value={frequency} onChange={(_, data) => setFrequency(data.value)}><option value="">Use service default</option>{["one_off", "weekly", "monthly", "quarterly", "annually"].map(value => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</Select></Field>
  </DialogContent><DialogActions><Button type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" appearance="primary" disabled={busy || loading || !serviceId || !start}>{busy ? "Adding…" : "Add service"}</Button></DialogActions></DialogBody></form></DialogSurface></Dialog>;
}
