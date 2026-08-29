import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Checkbox, createTableColumn, Field, Input, Select, Skeleton,
  SkeletonItem, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
  MessageBar, MessageBarBody, Textarea,
} from "@fluentui/react-components";
import { api, type ApiContext, type CrmOpportunity, type CrmProspect, type OnboardingCase, type OpportunityCapabilities, type Organisation, type PlatformTeam, type PracticeService, type ResourceProfile } from "./api";
import { formatDate } from "./displayFormat";
import { statutoryLabel } from "./format";
import { DetailHeader, EmptyState, ErrorState, FilterBar, OperationalDataGrid, PageHeader, StatusTreatment } from "./CanonicalPatterns";
import "./practice-management.css";

export type CrmOnboardingView = "prospects" | "opportunities" | "onboarding";
type Props = {
  view: CrmOnboardingView;
  context: ApiContext;
  onOpenQuoteBench?: (opportunityId: string) => void;
  quoteBenchAvailable?: boolean;
  routePath?: string;
  routeSearch?: string;
  onNavigate?: (path: string) => void;
};

const label = statutoryLabel;
const date = (value?: string | null) => formatDate(value, "Not set");
const errorText = (value: unknown) => value instanceof Error ? value.message : "The request could not be completed.";
export function filterCrmProspects(items: CrmProspect[], query: string, status: string, ownerFilter: string): CrmProspect[] {
  const term = query.trim().toLowerCase();
  return items.filter((item) => {
    const owner = item.responsible_member_id || item.responsible_team_id || "unassigned";
    return (!term || [item.display_name, item.legal_name, item.primary_contact_name, item.primary_contact_email, item.source].some((value) => value?.toLowerCase().includes(term)))
      && (!ownerFilter || owner === ownerFilter)
      && (status === "all" || (status === "active" ? !["lost", "converted", "archived"].includes(item.status) : item.status === status));
  });
}
function Status({ value }: { value: string }) { return <StatusTreatment value={value} />; }
function Head({ title, body }: { title: string; body: string }) { return <PageHeader title={title} description={body} />; }
function Loading({ text }: { text: string }) { return <Skeleton className="pm-loading" aria-label={text} role="status"><SkeletonItem size={24} /><SkeletonItem /><SkeletonItem /></Skeleton>; }
function Failure({ message, retry }: { message: string; retry: () => void }) { return <ErrorState message={message} retry={retry} />; }

export default function CrmOnboarding({ view, context, onOpenQuoteBench, quoteBenchAvailable = Boolean(onOpenQuoteBench), routePath = "", routeSearch = "", onNavigate }: Props) {
  if (view === "prospects") return <Prospects context={context} onNavigate={onNavigate} routePath={routePath} />;
  if (view === "opportunities") return <Opportunities context={context} onOpenQuoteBench={onOpenQuoteBench} quoteBenchAvailable={quoteBenchAvailable} routePath={routePath} routeSearch={routeSearch} onNavigate={onNavigate} />;
  return <Onboarding context={context} routeSearch={routeSearch} />;
}

function Prospects({ context, onNavigate, routePath }: { context: ApiContext; onNavigate?: (path: string) => void; routePath: string }) {
  const [items, setItems] = useState<CrmProspect[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState<CrmProspect | null>(null), [resources, setResources] = useState<ResourceProfile[]>([]), [teams, setTeams] = useState<PlatformTeam[]>([]), [saving, setSaving] = useState(false);
  const [name, setName] = useState(""), [entityType, setEntityType] = useState("COMPANY"), [source, setSource] = useState("");
  const [creating, setCreating] = useState(false), [query, setQuery] = useState(""), [statusFilter, setStatusFilter] = useState("active"), [ownerFilter, setOwnerFilter] = useState("");
  const [editName, setEditName] = useState(""), [editLegalName, setEditLegalName] = useState(""), [editSource, setEditSource] = useState(""), [editStatus, setEditStatus] = useState<CrmProspect["status"]>("prospect"), [editOwner, setEditOwner] = useState(""), [editTeam, setEditTeam] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.crmProspects(context)).items); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const id = routePath.match(/^\/practice\/crm\/prospects\/([^/]+)$/)?.[1]; if (id && items.length) { const item = items.find((candidate) => candidate.id === id); if (item) void open(item); } }, [routePath, items]);
  async function create(event: React.FormEvent) { event.preventDefault(); try { await api.createCrmProspect(context, { displayName: name, entityType, source: source || undefined, contactIds: [] }); setName(""); setSource(""); setCreating(false); await load(); } catch (e) { setError(errorText(e)); } }
  function setEditFields(item: CrmProspect) { setEditName(item.display_name); setEditLegalName(item.legal_name || ""); setEditSource(item.source || ""); setEditStatus(item.status); setEditOwner(item.responsible_member_id || ""); setEditTeam(item.responsible_team_id || ""); }
  async function open(item: CrmProspect) { setError(""); try { const detail = await api.crmProspect(context, item.id); setSelected(detail.item); setEditFields(detail.item); const [resourceResult, teamResult] = await Promise.allSettled([api.resourceProfiles(context), api.platformTeams(context)]); setResources(resourceResult.status === "fulfilled" ? resourceResult.value.items.filter((resource) => resource.status === "active") : []); setTeams(teamResult.status === "fulfilled" ? teamResult.value.items.filter((team) => team.status === "ACTIVE") : []); } catch (e) { setError(errorText(e)); } }
  async function save(event: React.FormEvent) { event.preventDefault(); if (!selected) return; setSaving(true); setError(""); try { await api.updateCrmProspect(context, selected.id, { displayName: editName, legalName: editLegalName, source: editSource, status: editStatus, responsibleMemberId: editOwner, responsibleTeamId: editTeam }); const [detail, list] = await Promise.all([api.crmProspect(context, selected.id), api.crmProspects(context)]); setSelected(detail.item); setEditFields(detail.item); setItems(list.items); } catch (e) { setError(errorText(e)); } finally { setSaving(false); } }
  const visible = useMemo(() => filterCrmProspects(items, query, statusFilter, ownerFilter), [items, ownerFilter, query, statusFilter]);
  const columns = useMemo(() => [
    createTableColumn<CrmProspect>({ columnId: "prospect", compare: (a, b) => a.display_name.localeCompare(b.display_name), renderHeaderCell: () => "Prospect", renderCell: (item) => <span className="pm-work-title"><span>{item.display_name}</span><small>{item.legal_name || label(item.entity_type)}</small></span> }),
    createTableColumn<CrmProspect>({ columnId: "contact", compare: (a, b) => (a.primary_contact_name || "").localeCompare(b.primary_contact_name || ""), renderHeaderCell: () => "Primary contact", renderCell: (item) => <span className="pm-work-title"><span>{item.primary_contact_name || "Not set"}</span>{item.primary_contact_email && <small>{item.primary_contact_email}</small>}</span> }),
    createTableColumn<CrmProspect>({ columnId: "opportunities", compare: (a, b) => (a.open_opportunities || 0) - (b.open_opportunities || 0), renderHeaderCell: () => "Open opportunities", renderCell: (item) => item.open_opportunities ?? 0 }),
    createTableColumn<CrmProspect>({ columnId: "owner", compare: (a, b) => (a.responsible_member_name || a.responsible_team_name || "").localeCompare(b.responsible_member_name || b.responsible_team_name || ""), renderHeaderCell: () => "Owner / team", renderCell: (item) => [item.responsible_member_name, item.responsible_team_name].filter(Boolean).join(" · ") || "Unassigned" }),
    createTableColumn<CrmProspect>({ columnId: "activity", compare: (a, b) => (a.last_activity_at || "").localeCompare(b.last_activity_at || ""), renderHeaderCell: () => "Last activity", renderCell: (item) => date(item.last_activity_at) }),
    createTableColumn<CrmProspect>({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Status", renderCell: (item) => <Status value={item.status} /> }),
  ], []);
  const owners = [...new Map(items.flatMap((item) => [
    item.responsible_member_id && item.responsible_member_name ? [item.responsible_member_id, item.responsible_member_name] as const : null,
    item.responsible_team_id && item.responsible_team_name ? [item.responsible_team_id, item.responsible_team_name] as const : null,
  ]).filter((item): item is readonly [string, string] => Boolean(item))).entries()].map(([id, name]) => ({ id, name }));
  function resetFilters() { setQuery(""); setStatusFilter("active"); setOwnerFilter(""); }
  if (loading) return <section className="pm-page"><Head title="Prospects" body="Pre-client relationships that convert into the canonical client master only after controlled acceptance." /><Loading text="Loading prospects" /></section>;
  if (selected) return <section className="pm-page"><DetailHeader title={selected.display_name} description={label(selected.entity_type)} back={() => { setSelected(null); onNavigate?.("/practice/crm/prospects"); }} backLabel="Back to prospects" status={<Status value={selected.status} />} facts={[{ label: "Owner", value: selected.responsible_member_name || "Unassigned" }, { label: "Team", value: selected.responsible_team_name || "Unassigned" }, { label: "Source", value: selected.source || "Not recorded" }, { label: "Open opportunities", value: selected.open_opportunities ?? 0 }]} primaryAction={<Button appearance="primary" disabled={selected.status === "converted" || selected.status === "archived"} onClick={() => onNavigate?.(`/practice/crm/opportunities/new?prospect=${encodeURIComponent(selected.id)}`)}>Create opportunity</Button>} />{error && <Failure message={error} retry={() => void open(selected)} />}
    <section className="pm-section"><header><div><h2>Prospect details</h2><p>Update the relationship record before it is converted to a client.</p></div><Status value={selected.status} /></header>
      {selected.status === "converted" ? <MessageBar><MessageBarBody>This prospect has been converted and is read-only. Open the client record to manage the ongoing relationship.</MessageBarBody></MessageBar> : <form className="pm-edit-grid" onSubmit={save}>
        <Field label="Prospect name" required><Input value={editName} maxLength={240} onChange={(_, data) => setEditName(data.value)} /></Field>
        <Field label="Legal name"><Input value={editLegalName} maxLength={240} onChange={(_, data) => setEditLegalName(data.value)} /></Field>
        <Field label="Source"><Input value={editSource} maxLength={120} onChange={(_, data) => setEditSource(data.value)} /></Field>
        <Field label="Status"><Select value={editStatus} onChange={(_, data) => setEditStatus(data.value as CrmProspect["status"])}>{["prospect","qualified","lost","archived"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
        <Field label="Owner"><Select value={editOwner} onChange={(_, data) => setEditOwner(data.value)}><option value="">Unassigned</option>{editOwner && !resources.some((resource) => resource.id === editOwner) && <option value={editOwner}>{selected.responsible_member_name || "Current owner"}</option>}{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}</Select></Field>
        <Field label="Team"><Select value={editTeam} onChange={(_, data) => setEditTeam(data.value)}><option value="">Unassigned</option>{editTeam && !teams.some((team) => team.id === editTeam) && <option value={editTeam}>{selected.responsible_team_name || "Current team"}</option>}{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></Field>
        <div className="pm-form-actions"><Button type="button" onClick={() => setEditFields(selected)}>Cancel changes</Button><Button appearance="primary" type="submit" disabled={!editName.trim() || saving}>{saving ? "Saving…" : "Save changes"}</Button></div>
      </form>}
    </section>
    <section className="pm-section"><header><h2>Contacts</h2></header>{selected.contacts?.length ? <Table aria-label="Prospect contacts"><TableHeader><TableRow><TableHeaderCell>Contact</TableHeaderCell><TableHeaderCell>Relationship</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.contacts.map((contact, index) => <TableRow key={String(contact.id ?? index)}><TableCell>{String(contact.display_name ?? "Contact")}</TableCell><TableCell>{label(String(contact.relationship_type ?? "contact"))}</TableCell></TableRow>)}</TableBody></Table> : <p>No contacts are linked to this prospect.</p>}</section>
    <section className="pm-section"><header><h2>Activity</h2></header>{selected.activities?.length ? <Table aria-label="Prospect activity"><TableHeader><TableRow><TableHeaderCell>Activity</TableHeaderCell><TableHeaderCell>Date</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.activities.map((activity, index) => <TableRow key={String(activity.id ?? index)}><TableCell>{String(activity.summary ?? label(String(activity.activity_type ?? "activity")))}</TableCell><TableCell>{date(String(activity.occurred_at ?? ""))}</TableCell></TableRow>)}</TableBody></Table> : <p>No activity has been recorded.</p>}</section>
  </section>;
  return <section className="pm-page"><PageHeader title="Prospects" description="Qualify relationships before creating an opportunity or client." primaryAction={<Button appearance="primary" onClick={() => setCreating(true)}>New prospect</Button>} />{error && <Failure message={error} retry={load} />}
    {creating && <section className="pm-section"><header><div><h2>New prospect</h2><p>Create the relationship record; this does not create a client.</p></div></header><form className="pm-add-row" onSubmit={create}><Field label="Prospect name" required><Input value={name} maxLength={240} onChange={(_, data) => setName(data.value)} /></Field><Field label="Entity type"><Select value={entityType} onChange={(_, data) => setEntityType(data.value)}>{["COMPANY","PARTNERSHIP","SOLE_TRADER","INDIVIDUAL","CHARITY","TRUST","OTHER"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field><Field label="Source"><Input value={source} maxLength={120} onChange={(_, data) => setSource(data.value)} /></Field><div className="pm-form-actions"><Button type="button" onClick={() => setCreating(false)}>Cancel</Button><Button appearance="primary" type="submit" disabled={!name.trim()}>Create prospect</Button></div></form></section>}
    <FilterBar label="Prospect filters" summary={`${visible.length} ${visible.length === 1 ? "prospect" : "prospects"}`} reset={query || ownerFilter || statusFilter !== "active" ? resetFilters : undefined}><Field label="Search"><Input type="search" value={query} placeholder="Name, contact or source" onChange={(_, data) => setQuery(data.value)} /></Field><Field label="Status"><Select value={statusFilter} onChange={(_, data) => setStatusFilter(data.value)}>{[["active", "Active"], ["qualified", "Qualified"], ["lost", "Lost"], ["converted", "Converted"], ["archived", "Archived"], ["all", "All"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</Select></Field><Field label="Owner or team"><Select value={ownerFilter} onChange={(_, data) => setOwnerFilter(data.value)}><option value="">All owners and teams</option><option value="unassigned">Unassigned</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</Select></Field></FilterBar>
    <OperationalDataGrid items={visible} columns={columns} label="CRM prospects" getRowId={(item) => item.id} primaryColumnId="prospect" getItemHref={(item) => `/practice/crm/prospects/${item.id}`} onOpenItem={(item) => onNavigate ? onNavigate(`/practice/crm/prospects/${item.id}`) : void open(item)} empty={<EmptyState title={items.length ? "No matching prospects" : "No prospects"} description={items.length ? "Clear or adjust the filters to see more relationships." : "Create the first prospect to begin a commercial relationship."} action={items.length ? <Button onClick={resetFilters}>Clear filters</Button> : <Button appearance="primary" onClick={() => setCreating(true)}>New prospect</Button>} />} />
  </section>;
}

const opportunityStages = ["qualification", "discovery", "scoped", "proposal", "negotiation", "lost"];

type OpportunityDraft = {
  name: string; relationshipType: "prospect" | "client"; prospectId: string; existingClientId: string; stageKey: string; expectedCloseDate: string; probability: string;
  estimatedValue: string; currency: string; responsibleMemberId: string; responsibleTeamId: string; serviceIds: string[];
};
const blankOpportunity = (): OpportunityDraft => ({ name: "", relationshipType: "prospect", prospectId: "", existingClientId: "", stageKey: "qualification", expectedCloseDate: "", probability: "", estimatedValue: "", currency: "GBP", responsibleMemberId: "", responsibleTeamId: "", serviceIds: [] });
const activityDate = (value: unknown) => typeof value === "string" ? date(value) : "Not set";

function Opportunities({ context, onOpenQuoteBench, quoteBenchAvailable, routePath, routeSearch, onNavigate }: {
  context: ApiContext; onOpenQuoteBench?: (opportunityId: string) => void; quoteBenchAvailable: boolean;
  routePath: string; routeSearch: string; onNavigate?: (path: string) => void;
}) {
  const [items, setItems] = useState<CrmOpportunity[]>([]), [prospects, setProspects] = useState<CrmProspect[]>([]), [clients, setClients] = useState<Organisation[]>([]), [services, setServices] = useState<PracticeService[]>([]);
  const [resources, setResources] = useState<ResourceProfile[]>([]), [teams, setTeams] = useState<PlatformTeam[]>([]);
  const [selected, setSelected] = useState<CrmOpportunity | null>(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [permissionDenied, setPermissionDenied] = useState(false);
  const [capabilities, setCapabilities] = useState<OpportunityCapabilities>({ canCreate: false, canEdit: false, canConvert: false, quoteBenchAvailable: false });
  const [draft, setDraft] = useState<OpportunityDraft>(blankOpportunity), [edit, setEdit] = useState<OpportunityDraft>(blankOpportunity);
  const [editing, setEditing] = useState(false), [proposalId, setProposalId] = useState(""), [nextStage, setNextStage] = useState(""), [lostReason, setLostReason] = useState("");
  const [query, setQuery] = useState(""), [stageFilter, setStageFilter] = useState(""), [ownerFilter, setOwnerFilter] = useState(""), [lifecycle, setLifecycle] = useState("active");
  const createMode = /\/opportunities\/new$/.test(routePath);
  const routeOpportunityId = routePath.match(/^\/practice\/crm\/opportunities\/([^/]+)$/)?.[1];
  const contextualProspectId = new URLSearchParams(routeSearch).get("prospect") || "";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [opportunityData, prospectData, serviceData, resourceData, teamData, clientData] = await Promise.allSettled([
        api.crmOpportunities(context), api.crmProspects(context), api.practiceServices(context), api.resourceProfiles(context), api.platformTeams(context), api.organisations(context),
      ]);
      if (opportunityData.status === "rejected") throw opportunityData.reason;
      setItems(opportunityData.value.items);
      if (opportunityData.value.capabilities) setCapabilities(opportunityData.value.capabilities);
      setProspects(prospectData.status === "fulfilled" ? prospectData.value.items.filter((item) => !["converted", "archived"].includes(item.status)) : []);
      setServices(serviceData.status === "fulfilled" ? serviceData.value.items.filter((item) => item.status === "active") : []);
      setResources(resourceData.status === "fulfilled" ? resourceData.value.items.filter((item) => item.status === "active") : []);
      setTeams(teamData.status === "fulfilled" ? teamData.value.items.filter((item) => item.status === "ACTIVE") : []);
      setClients(clientData.status === "fulfilled" ? clientData.value.items : []);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [context]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (createMode && contextualProspectId) setDraft((current) => ({ ...current, relationshipType: "prospect", prospectId: contextualProspectId, existingClientId: "" })); }, [createMode, contextualProspectId]);

  const setEditFields = useCallback((item: CrmOpportunity) => setEdit({
    name: item.name, relationshipType: item.prospect_id ? "prospect" : "client", prospectId: item.prospect_id || "", existingClientId: item.existing_client_id || "", stageKey: item.stage_key,
    expectedCloseDate: item.expected_close_date || "", probability: item.probability == null ? "" : String(item.probability),
    estimatedValue: item.estimated_value == null ? "" : String(item.estimated_value), currency: item.currency || "GBP",
    responsibleMemberId: item.responsible_member_id || "", responsibleTeamId: item.responsible_team_id || "",
    serviceIds: (item.services || []).map((service) => service.serviceId || service.service_id || "").filter(Boolean),
  }), []);
  const openId = useCallback(async (id: string) => { setError(""); try { const detail = (await api.crmOpportunity(context, id)).item; setSelected(detail); if (detail.capabilities) setCapabilities(detail.capabilities); setEditFields(detail); setEditing(false); setNextStage(""); setLostReason(""); } catch (e) { setError(errorText(e)); } }, [context, setEditFields]);
  useEffect(() => { if (routeOpportunityId && routeOpportunityId !== "new") void openId(routeOpportunityId); else if (!routeOpportunityId) setSelected(null); }, [routeOpportunityId, openId]);

  const visible = useMemo(() => items.filter((item) => {
    const needle = query.trim().toLowerCase();
    const searchable = [item.name, item.relationship_name, ...(item.services || []).map((service) => service.name || service.service_name)].filter(Boolean).join(" ").toLowerCase();
    const owner = item.responsible_member_id || item.responsible_team_id || "unassigned";
    return (!needle || searchable.includes(needle)) && (!stageFilter || item.stage_key === stageFilter) && (!ownerFilter || owner === ownerFilter)
      && (lifecycle === "all" || (lifecycle === "active" ? item.status === "open" : item.status === lifecycle));
  }), [items, query, stageFilter, ownerFilter, lifecycle]);

  const columns = useMemo(() => [
    createTableColumn<CrmOpportunity>({ columnId: "opportunity", compare: (a, b) => a.name.localeCompare(b.name), renderHeaderCell: () => "Opportunity", renderCell: (item) => <span className="pm-work-title"><span>{item.name}</span><small>{item.relationship_name || "Relationship not set"}</small></span> }),
    createTableColumn<CrmOpportunity>({ columnId: "services", compare: (a, b) => (a.services?.[0]?.name || "").localeCompare(b.services?.[0]?.name || ""), renderHeaderCell: () => "Proposed services", renderCell: (item) => item.services?.map((service) => service.name || service.service_name).filter(Boolean).join(", ") || "None" }),
    createTableColumn<CrmOpportunity>({ columnId: "stage", compare: (a, b) => a.stage_key.localeCompare(b.stage_key), renderHeaderCell: () => "Stage", renderCell: (item) => <Status value={item.stage_key} /> }),
    createTableColumn<CrmOpportunity>({ columnId: "owner", compare: (a, b) => (a.responsible_member_name || a.responsible_team_name || "").localeCompare(b.responsible_member_name || b.responsible_team_name || ""), renderHeaderCell: () => "Owner / team", renderCell: (item) => [item.responsible_member_name, item.responsible_team_name].filter(Boolean).join(" · ") || "Unassigned" }),
    createTableColumn<CrmOpportunity>({ columnId: "close", compare: (a, b) => (a.expected_close_date || "").localeCompare(b.expected_close_date || ""), renderHeaderCell: () => "Expected close", renderCell: (item) => date(item.expected_close_date) }),
    createTableColumn<CrmOpportunity>({ columnId: "value", compare: (a, b) => Number(a.estimated_value || 0) - Number(b.estimated_value || 0), renderHeaderCell: () => "Value", renderCell: (item) => item.estimated_value == null ? "Not estimated" : `${item.currency} ${item.estimated_value}` }),
    createTableColumn<CrmOpportunity>({ columnId: "proposal", compare: (a, b) => (a.proposal_status || "").localeCompare(b.proposal_status || ""), renderHeaderCell: () => "Proposal", renderCell: (item) => item.proposal_status ? <Status value={item.proposal_status} /> : "Not linked" }),
  ], []);

  function toggleService(target: "draft" | "edit", serviceId: string, checked: boolean) {
    const update = (current: OpportunityDraft) => ({ ...current, serviceIds: checked ? [...new Set([...current.serviceIds, serviceId])] : current.serviceIds.filter((id) => id !== serviceId) });
    target === "draft" ? setDraft(update) : setEdit(update);
  }
  function permissionError(e: unknown) { if ((e as { status?: number })?.status === 403) setPermissionDenied(true); setError(errorText(e)); }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await api.createCrmOpportunity(context, { ...draft, probability: draft.probability || undefined, estimatedValue: draft.estimatedValue || undefined, expectedCloseDate: draft.expectedCloseDate || undefined });
      setDraft(blankOpportunity()); setNotice("Opportunity created."); await load(); onNavigate?.(`/practice/crm/opportunities/${result.item.id}`);
    } catch (e) { permissionError(e); } finally { setSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); setNotice("");
    try {
      await api.updateCrmOpportunity(context, selected.id, { name: edit.name, expectedCloseDate: edit.expectedCloseDate || null, probability: edit.probability || null, estimatedValue: edit.estimatedValue || null, currency: edit.currency, responsibleMemberId: edit.responsibleMemberId || null, responsibleTeamId: edit.responsibleTeamId || null, serviceIds: edit.serviceIds });
      await openId(selected.id); await load(); setEditing(false); setNotice("Opportunity changes saved.");
    } catch (e) { permissionError(e); } finally { setSaving(false); }
  }
  async function progressStage() {
    if (!selected || !nextStage || nextStage === selected.stage_key || (nextStage === "lost" && !lostReason.trim())) return;
    setSaving(true); setError(""); setNotice("");
    try { await api.updateOpportunityStage(context, selected.id, nextStage, nextStage === "lost" ? lostReason.trim() : undefined); await openId(selected.id); await load(); setNotice(nextStage === "lost" ? "Opportunity marked lost." : "Stage updated."); }
    catch (e) { permissionError(e); } finally { setSaving(false); }
  }
  async function linkProposal() {
    if (!selected || !proposalId.trim() || !quoteBenchAvailable || !capabilities.quoteBenchAvailable) return; setSaving(true); setError("");
    try { await api.linkQuoteBenchProposal(context, selected.id, proposalId.trim()); setProposalId(""); await openId(selected.id); await load(); setNotice("QuoteBench proposal linked."); }
    catch (e) { permissionError(e); } finally { setSaving(false); }
  }
  function resetFilters() { setQuery(""); setStageFilter(""); setOwnerFilter(""); setLifecycle("active"); }
  if (loading) return <section className="pm-page"><Head title="Opportunities" body="Commercial pipeline from qualified relationship to accepted proposal and conversion." /><Loading text="Loading opportunities" /></section>;

  if (createMode) return <section className="pm-page"><Button appearance="subtle" onClick={() => onNavigate?.("/practice/crm/opportunities")}>Back to opportunities</Button><Head title="New opportunity" body={contextualProspectId ? "Create an opportunity for the selected prospect." : "Create a commercial opportunity."} />{error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {!capabilities.canCreate && <MessageBar intent="warning"><MessageBarBody>You need the opportunity create permission to add an opportunity.</MessageBarBody></MessageBar>}
    <section className="pm-section"><header><h2>Opportunity details</h2></header><OpportunityForm value={draft} setValue={setDraft} prospects={prospects} clients={clients} services={services} resources={resources} teams={teams} onToggleService={(id, checked) => toggleService("draft", id, checked)} disabled={!capabilities.canCreate || permissionDenied || saving} submitLabel={saving ? "Creating…" : "Create opportunity"} onSubmit={create} onCancel={() => onNavigate?.("/practice/crm/opportunities")} /></section>
  </section>;

  if (selected) {
    const conversion = (selected.conversion || {}) as Record<string, unknown>;
    const clientId = String(conversion.client_id || selected.existing_client_id || "");
    const onboardingId = String(conversion.onboarding_case_id || "");
    return <section className="pm-page"><DetailHeader title={selected.name} description={selected.relationship_name || "Relationship not set"} status={<Status value={selected.status} />} back={() => onNavigate?.("/practice/crm/opportunities")} backLabel="Back to opportunities" primaryAction={<Button appearance="primary" disabled={selected.status !== "open" || permissionDenied || !capabilities.canEdit} onClick={() => setEditing(true)}>Edit opportunity</Button>} secondaryActions={<>{selected.prospect_id && <Button onClick={() => onNavigate?.(`/practice/crm/prospects/${selected.prospect_id}`)}>Open prospect</Button>}{clientId && <Button onClick={() => onNavigate?.(`/practice/clients?client=${encodeURIComponent(clientId)}`)}>Open client</Button>}</>} facts={[{ label: "Stage", value: label(selected.stage_key) }, { label: "Owner", value: selected.responsible_member_name || "Unassigned" }, { label: "Team", value: selected.responsible_team_name || "Unassigned" }, { label: "Expected close", value: date(selected.expected_close_date) }]} />
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}{error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {(permissionDenied || !capabilities.canEdit) && <MessageBar intent="warning"><MessageBarBody>You need the opportunity edit permission to change this record. Its commercial details remain available to view.</MessageBarBody></MessageBar>}
      <section className="pm-section"><header><div><h2>Commercial position</h2><p>Current opportunity state and accountable ownership.</p></div><Status value={selected.status} /></header>
        <dl className="pm-facts"><div><dt>Prospect / client</dt><dd>{selected.relationship_name || "Not set"}</dd></div><div><dt>Stage</dt><dd>{label(selected.stage_key)}</dd></div><div><dt>Owner / team</dt><dd>{[selected.responsible_member_name, selected.responsible_team_name].filter(Boolean).join(" · ") || "Unassigned"}</dd></div><div><dt>Expected close</dt><dd>{date(selected.expected_close_date)}</dd></div><div><dt>Value</dt><dd>{selected.estimated_value == null ? "Not estimated" : `${selected.currency} ${selected.estimated_value}`}</dd></div><div><dt>Probability</dt><dd>{selected.probability == null ? "Not set" : `${selected.probability}%`}</dd></div><div><dt>Proposal</dt><dd>{selected.proposal_status ? label(selected.proposal_status) : "Not linked"}</dd></div><div><dt>Commercial outcome</dt><dd>{selected.status === "won" ? "Won through accepted QuoteBench proposal" : selected.status === "lost" ? `Lost${selected.outcome_reason ? ` — ${selected.outcome_reason}` : ""}` : "Open"}</dd></div><div><dt>Conversion</dt><dd>{label(selected.conversion_state || "not_converted")}</dd></div></dl>
        {editing && selected.status === "open" && <OpportunityForm value={edit} setValue={setEdit} prospects={prospects} clients={clients} services={services} resources={resources} teams={teams} onToggleService={(id, checked) => toggleService("edit", id, checked)} disabled={saving} submitLabel={saving ? "Saving…" : "Save changes"} onSubmit={save} onCancel={() => { setEditFields(selected); setEditing(false); }} hideRelationship />}
      </section>
      <section className="pm-section"><header><div><h2>Stage and outcome</h2><p>A won outcome can only be recorded by a signed QuoteBench acceptance event.</p></div></header>
        {selected.status === "open" ? <div className="pm-stage-actions"><Field label="Move from current stage"><Select value={nextStage} disabled={!capabilities.canEdit || permissionDenied || saving} onChange={(_, data) => setNextStage(data.value)}><option value="">Select next stage</option>{opportunityStages.filter((value) => value !== selected.stage_key).map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>{nextStage === "lost" && <Field label="Loss reason" required><Textarea value={lostReason} maxLength={1000} onChange={(_, data) => setLostReason(data.value)} /></Field>}<Button appearance="primary" disabled={!nextStage || (nextStage === "lost" && !lostReason.trim()) || saving || permissionDenied || !capabilities.canEdit} onClick={() => void progressStage()}>{nextStage === "lost" ? "Mark lost" : "Update stage"}</Button></div> : <p>This opportunity is {selected.status}. Its outcome and transition history are read-only.</p>}
      </section>
      <section className="pm-section"><header><h2>Proposed services</h2></header>{selected.services?.length ? <Table aria-label="Opportunity proposed services"><TableHeader><TableRow><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Commercial state</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.services.map((service) => <TableRow key={service.id}><TableCell>{service.service_name || service.name || "Service"}</TableCell><TableCell>{service.accepted ? "Accepted and activated" : "Proposed"}</TableCell></TableRow>)}</TableBody></Table> : <p>No services are proposed. Edit the opportunity before linking a proposal.</p>}</section>
      <section className="pm-section"><header><div><h2>QuoteBench proposal</h2><p>Proposal authoring, pricing and signed acceptance remain in QuoteBench.</p></div>{quoteBenchAvailable && capabilities.quoteBenchAvailable && onOpenQuoteBench && <Button disabled={selected.status !== "open"} onClick={() => onOpenQuoteBench(selected.id)}>Open in QuoteBench</Button>}</header>
        {!(quoteBenchAvailable && capabilities.quoteBenchAvailable) ? <MessageBar intent="info"><MessageBarBody>QuoteBench proposals are not enabled for this practice. An owner can review Apps &amp; entitlements in Settings.</MessageBarBody><Button appearance="transparent" onClick={() => onNavigate?.("/settings/apps-entitlements")}>View entitlements</Button></MessageBar> : <div className="pm-add-row"><Field label="Proposal reference"><Input value={proposalId} disabled={selected.status !== "open" || permissionDenied || !capabilities.canEdit} onChange={(_, data) => setProposalId(data.value)} /></Field><Button appearance="primary" disabled={!proposalId.trim() || selected.status !== "open" || saving || permissionDenied || !capabilities.canEdit} onClick={() => void linkProposal()}>Link proposal</Button></div>}
        {selected.proposals?.length ? <Table aria-label="QuoteBench proposal references"><TableHeader><TableRow><TableHeaderCell>Proposal</TableHeaderCell><TableHeaderCell>Version</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Last event</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.proposals.map((proposal, index) => <TableRow key={String(proposal.id ?? index)}><TableCell>{String(proposal.proposal_id ?? "Proposal")}</TableCell><TableCell>{String(proposal.proposal_version ?? "1")}</TableCell><TableCell><Status value={String(proposal.status ?? "created")} /></TableCell><TableCell>{activityDate(proposal.last_event_at)}</TableCell></TableRow>)}</TableBody></Table> : <p>No proposal is linked.</p>}
      </section>
      <section className="pm-section"><header><h2>Conversion and onboarding</h2></header>{selected.status === "won" ? <><dl className="pm-facts"><div><dt>Commercially won</dt><dd>Signed proposal accepted</dd></div><div><dt>Client conversion</dt><dd>{clientId ? "Canonical client created or linked" : "Pending"}</dd></div><div><dt>Onboarding</dt><dd>{onboardingId ? "Onboarding case created" : "No onboarding case required or available"}</dd></div><div><dt>Operational readiness</dt><dd>{onboardingId ? "Managed through onboarding gates" : "Review activated services"}</dd></div></dl><div className="pm-command-bar">{clientId && <Button appearance="primary" onClick={() => onNavigate?.(`/practice/clients?client=${encodeURIComponent(clientId)}`)}>Open client</Button>}{onboardingId && <Button onClick={() => onNavigate?.(`/practice/onboarding?case=${encodeURIComponent(onboardingId)}`)}>Open onboarding</Button>}</div></> : <p>Conversion starts only after QuoteBench sends a valid signed acceptance event. Changing a pipeline stage does not create a client.</p>}</section>
      <section className="pm-section"><header><h2>Activity history</h2></header>{selected.activities?.length ? <Table aria-label="Opportunity activity"><TableHeader><TableRow><TableHeaderCell>Activity</TableHeaderCell><TableHeaderCell>Date</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.activities.map((activity, index) => <TableRow key={String(activity.id ?? index)}><TableCell>{String(activity.summary ?? label(String(activity.activity_type ?? "activity")))}</TableCell><TableCell>{activityDate(activity.occurred_at)}</TableCell></TableRow>)}</TableBody></Table> : <p>No activity has been recorded.</p>}</section>
    </section>;
  }

  return <section className="pm-page"><PageHeader title="Opportunities" description="Commercial pipeline from qualified relationship to accepted proposal and conversion." primaryAction={<Button appearance="primary" disabled={permissionDenied || !capabilities.canCreate} onClick={() => onNavigate?.("/practice/crm/opportunities/new")}>New opportunity</Button>} />
    {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}{error && <Failure message={error} retry={load} />}
    <FilterBar label="Opportunity filters" summary={`${visible.length} ${visible.length === 1 ? "opportunity" : "opportunities"}`} reset={query || stageFilter || ownerFilter || lifecycle !== "active" ? resetFilters : undefined}><Field label="Search"><Input type="search" value={query} placeholder="Opportunity, relationship or service" onChange={(_, data) => setQuery(data.value)} /></Field><Field label="Stage"><Select value={stageFilter} onChange={(_, data) => setStageFilter(data.value)}><option value="">All stages</option>{opportunityStages.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field><Field label="Owner or team"><Select value={ownerFilter} onChange={(_, data) => setOwnerFilter(data.value)}><option value="">All owners and teams</option><option value="unassigned">Unassigned</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></Field><Field label="Lifecycle"><Select value={lifecycle} onChange={(_, data) => setLifecycle(data.value)}>{[["active", "Active"], ["won", "Won"], ["lost", "Lost"], ["all", "All"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</Select></Field></FilterBar>
    <OperationalDataGrid items={visible} columns={columns} label="CRM opportunities" getRowId={(item) => item.id} primaryColumnId="opportunity" getItemHref={(item) => `/practice/crm/opportunities/${item.id}`} onOpenItem={(item) => onNavigate?.(`/practice/crm/opportunities/${item.id}`)} empty={<EmptyState title={items.length ? "No matching opportunities" : "No opportunities"} description={items.length ? "Clear or adjust the filters to see more of the pipeline." : "Create an opportunity here or from a prospect record."} action={items.length ? <Button onClick={resetFilters}>Clear filters</Button> : <Button appearance="primary" disabled={!capabilities.canCreate} onClick={() => onNavigate?.("/practice/crm/opportunities/new")}>New opportunity</Button>} />} />
  </section>;
}

function OpportunityForm({ value, setValue, prospects, clients, services, resources, teams, onToggleService, disabled, submitLabel, onSubmit, onCancel, hideRelationship = false }: {
  value: OpportunityDraft; setValue: React.Dispatch<React.SetStateAction<OpportunityDraft>>; prospects: CrmProspect[]; clients: Organisation[]; services: PracticeService[]; resources: ResourceProfile[]; teams: PlatformTeam[];
  onToggleService: (serviceId: string, checked: boolean) => void; disabled: boolean; submitLabel: string; onSubmit: (event: React.FormEvent) => void; onCancel: () => void; hideRelationship?: boolean;
}) {
  const set = (field: keyof OpportunityDraft, next: string) => setValue((current) => ({ ...current, [field]: next }));
  return <form className="pm-edit-grid" onSubmit={onSubmit}>
    <Field label="Opportunity name" required><Input value={value.name} maxLength={240} disabled={disabled} onChange={(_, data) => set("name", data.value)} /></Field>
    {!hideRelationship && <Field label="Relationship type"><Select value={value.relationshipType} disabled={disabled} onChange={(_, data) => setValue((current) => ({ ...current, relationshipType: data.value as "prospect" | "client", prospectId: "", existingClientId: "" }))}><option value="prospect">Prospect</option><option value="client">Existing client</option></Select></Field>}
    {!hideRelationship && value.relationshipType === "prospect" && <Field label="Prospect" required><Select value={value.prospectId} disabled={disabled} onChange={(_, data) => set("prospectId", data.value)}><option value="">Select prospect</option>{prospects.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</Select></Field>}
    {!hideRelationship && value.relationshipType === "client" && <Field label="Client" required><Select value={value.existingClientId} disabled={disabled} onChange={(_, data) => set("existingClientId", data.value)}><option value="">Select client</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</Select></Field>}
    {!hideRelationship && <Field label="Initial stage"><Select value={value.stageKey} disabled={disabled} onChange={(_, data) => set("stageKey", data.value)}>{opportunityStages.filter((stage) => stage !== "lost").map((stage) => <option key={stage} value={stage}>{label(stage)}</option>)}</Select></Field>}
    <Field label="Owner"><Select value={value.responsibleMemberId} disabled={disabled} onChange={(_, data) => set("responsibleMemberId", data.value)}><option value="">Unassigned</option>{value.responsibleMemberId && !resources.some((resource) => resource.id === value.responsibleMemberId) && <option value={value.responsibleMemberId}>Current owner</option>}{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}</Select></Field>
    <Field label="Team"><Select value={value.responsibleTeamId} disabled={disabled} onChange={(_, data) => set("responsibleTeamId", data.value)}><option value="">Unassigned</option>{value.responsibleTeamId && !teams.some((team) => team.id === value.responsibleTeamId) && <option value={value.responsibleTeamId}>Current team</option>}{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></Field>
    <Field label="Expected close"><Input type="date" value={value.expectedCloseDate} disabled={disabled} onChange={(_, data) => set("expectedCloseDate", data.value)} /></Field>
    <Field label="Probability" hint="0–100 percent"><Input type="number" min={0} max={100} value={value.probability} disabled={disabled} onChange={(_, data) => set("probability", data.value)} /></Field>
    <Field label="Estimated value"><Input type="number" min={0} step="0.01" value={value.estimatedValue} disabled={disabled} onChange={(_, data) => set("estimatedValue", data.value)} /></Field>
    <Field label="Currency"><Input value={value.currency} maxLength={3} disabled={disabled} onChange={(_, data) => set("currency", data.value.toUpperCase())} /></Field>
    <fieldset className="pm-service-options"><legend>Proposed services</legend>{services.map((service) => <Checkbox key={service.id} label={service.name} checked={value.serviceIds.includes(service.id)} disabled={disabled} onChange={(_, data) => onToggleService(service.id, data.checked === true)} />)}{!services.length && <p>No active services are configured.</p>}</fieldset>
    <div className="pm-form-actions"><Button type="button" disabled={disabled} onClick={onCancel}>Cancel</Button><Button appearance="primary" type="submit" disabled={disabled || !value.name.trim() || (!hideRelationship && value.relationshipType === "prospect" && !value.prospectId) || (!hideRelationship && value.relationshipType === "client" && !value.existingClientId) || !value.serviceIds.length || !/^[A-Z]{3}$/.test(value.currency) || Number(value.probability || 0) < 0 || Number(value.probability || 0) > 100}>{submitLabel}</Button></div>
  </form>;
}

function Onboarding({ context, routeSearch = "" }: { context: ApiContext; routeSearch?: string }) {
  const [items, setItems] = useState<OnboardingCase[]>([]), [selected, setSelected] = useState<OnboardingCase | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.onboardingCases(context)).items); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const caseId = new URLSearchParams(routeSearch).get("case"); if (caseId) void open(caseId); }, [routeSearch]);
  async function open(id: string) { try { setSelected((await api.onboardingCase(context, id)).item); } catch (e) { setError(errorText(e)); } }
  async function status(value: OnboardingCase["status"]) { if (!selected) return; try { await api.updateOnboardingStatus(context, selected.id, value); await open(selected.id); await load(); } catch (e) { setError(errorText(e)); } }
  if (loading) return <Loading text="Loading onboarding work" />;
  if (selected) return <section className="pm-page"><Button appearance="subtle" onClick={() => setSelected(null)}>Back to onboarding</Button><Head title={selected.client_name || "Client onboarding"} body={`${selected.opportunity_name || "Accepted opportunity"} · ${selected.engagement_name || "Engagement"}`} />{error && <Failure message={error} retry={() => void open(selected.id)} />}
    <section className="pm-section"><header><div><h2>Onboarding status</h2><p>Mandatory workflow tasks and blockers gate operational readiness.</p></div><Status value={selected.status} /></header><Field label="Status"><Select value={selected.status} disabled={["completed","cancelled"].includes(selected.status)} onChange={(_, data) => void status(data.value as OnboardingCase["status"])}>{["not_started","in_progress","blocked","ready_for_delivery","completed","cancelled"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field></section>
    <section className="pm-section"><header><h2>Required actions</h2></header><Table aria-label="Onboarding required actions"><TableHeader><TableRow><TableHeaderCell>Action</TableHeaderCell><TableHeaderCell>Stage</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.tasks?.map((task) => <TableRow key={task.id}><TableCell>{task.title}</TableCell><TableCell>{selected.stages?.find((stage) => stage.id === (task as typeof task & { work_stage_id?: string }).work_stage_id)?.name || "Onboarding"}</TableCell><TableCell><Status value={task.status} /></TableCell></TableRow>)}</TableBody></Table></section>
    <section className="pm-section"><header><h2>Blockers</h2></header>{selected.blockers?.length ? <Table aria-label="Onboarding blockers"><TableHeader><TableRow><TableHeaderCell>Blocker</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{selected.blockers.map((blocker) => <TableRow key={blocker.id}><TableCell>{blocker.summary}</TableCell><TableCell><Status value={blocker.status} /></TableCell></TableRow>)}</TableBody></Table> : <p>No blockers recorded.</p>}</section>
  </section>;
  return <section className="pm-page"><Head title="Onboarding" body="Accepted clients moving through workflow-backed readiness gates into service delivery." />{error && <Failure message={error} retry={load} />}<div className="pm-grid-scroll"><Table aria-label="Onboarding work"><TableHeader><TableRow><TableHeaderCell>Client</TableHeaderCell><TableHeaderCell>Opportunity</TableHeaderCell><TableHeaderCell>Engagement</TableHeaderCell><TableHeaderCell>Workflow</TableHeaderCell><TableHeaderCell>Blockers</TableHeaderCell><TableHeaderCell>Updated</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell><Button appearance="transparent" onClick={() => void open(item.id)}>{item.client_name || "Client"}</Button></TableCell><TableCell>{item.opportunity_name || "Opportunity"}</TableCell><TableCell>{item.engagement_name || "Engagement"}</TableCell><TableCell>{item.work_title || "No template configured"}</TableCell><TableCell>{item.open_blockers ?? 0}</TableCell><TableCell>{date(item.updated_at)}</TableCell><TableCell><Status value={item.status} /></TableCell></TableRow>)}</TableBody></Table></div></section>;
}
