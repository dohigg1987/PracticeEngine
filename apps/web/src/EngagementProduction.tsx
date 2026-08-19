import React, { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Select,
  Skeleton,
  SkeletonItem,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Textarea,
} from "@fluentui/react-components";
import { CheckmarkRegular, WarningRegular } from "@fluentui/react-icons";
import {
  AccountsVersion,
  AccountsPresentation,
  api,
  ApiContext,
  ApiError,
  ArtefactCapabilities,
  Disclosure,
  EvidenceBundleCapability,
  FilingAttempt,
  HtmlArtefact,
  PdfArtefact,
  ReportLine,
  ReportingPack,
  TrialBalanceLine,
  WorkingPaper,
  WorkingPaperAttachment,
  WorkingPaperCategory,
  WorkingPaperGovernance,
  WorkingPaperGovernanceCatalogue,
  WorkingPaperLibraryItem,
  WorkingPaperRisk,
  WorkingPaperVersion,
} from "./api";
import { statutoryLabel } from "./format";
import { normalizeDisplayText } from "./displayFormat";
import {
  disclosureAnswerField,
  disclosureAnswerText,
  scopeDisclosureChecklist,
  type ScopedDisclosure,
  unresolvedDisclosurePlaceholders,
} from "./disclosureScope";
import { ConfirmAction, ConfirmDialog } from "./ConfirmAction";
import {
  workingPaperArea,
  workingPaperAreas,
} from "./workingPaperGovernance";

export type ProductionView =
  | "working-papers"
  | "disclosures"
  | "versions"
  | "filing";
type Props = {
  view: ProductionView;
  context: ApiContext;
  engagementId: string;
  framework: string;
  sectorProfile?: string;
  periodStart?: string;
  periodEnd?: string;
  report?: ReportLine[];
  trialBalance?: TrialBalanceLine[];
  onEngagementChanged: () => Promise<void> | void;
};
type EngagementProps = Pick<Props, "context" | "engagementId">;
const pretty = statutoryLabel;
const when = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const answerText = disclosureAnswerText;
const explanationText = (answer?: Record<string, unknown>) =>
  typeof answer?.explanation === "string" ? answer.explanation : "";

function Loading() {
  return (
    <Skeleton
      className="skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading engagement section"
    >
      <span className="sr-only">Loading engagement section…</span>
      <SkeletonItem size={24} />
      <SkeletonItem size={12} />
      <SkeletonItem size={12} />
      <SkeletonItem size={12} />
      <SkeletonItem size={12} />
    </Skeleton>
  );
}
function ErrorPanel({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <MessageBar className="inline-error" intent="error">
      <MessageBarBody>
        <b>Couldn’t load this section.</b> {message}
      </MessageBarBody>
      <MessageBarActions>
        <Button appearance="transparent" onClick={retry}>
          Retry
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}
function Blank({ title, body }: { title: string; body: string }) {
  return (
    <div className="production-empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
function Head({
  title,
  body,
  children,
}: React.PropsWithChildren<{ title: string; body: string }>) {
  return (
    <header className="panel-head">
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      {children}
    </header>
  );
}

export default function EngagementProduction({
  view,
  context,
  engagementId,
  framework,
  sectorProfile = "NONE",
  periodStart = "",
  periodEnd = "",
  report = [],
  trialBalance = [],
  onEngagementChanged,
}: Props) {
  if (view === "working-papers")
    return <WorkingPapers context={context} engagementId={engagementId} />;
  if (view === "disclosures")
    return (
      <Disclosures
        context={context}
        engagementId={engagementId}
        framework={framework}
        sectorProfile={sectorProfile}
        periodStart={periodStart}
        periodEnd={periodEnd}
        report={report}
        trialBalance={trialBalance}
      />
    );
  if (view === "versions")
    return (
      <AccountsVersions
        context={context}
        engagementId={engagementId}
        framework={framework}
      />
    );
  return (
    <FilingEvidence
      context={context}
      engagementId={engagementId}
      onEngagementChanged={onEngagementChanged}
    />
  );
}

function WorkingPapers({ context, engagementId }: EngagementProps) {
  const [items, setItems] = useState<WorkingPaper[]>([]);
  const [libraryItems, setLibraryItems] = useState<WorkingPaperLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [versions, setVersions] = useState<WorkingPaperVersion[]>([]);
  const [versionsError, setVersionsError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    title: "",
    categoryCode: "PLANNING" as WorkingPaperCategory,
    objective: "",
    content: "",
  });
  const [actionError, setActionError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openPaperGroups, setOpenPaperGroups] = useState<string[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, library] = await Promise.all([
        api.workingPapers(context, engagementId),
        api.workingPaperLibrary(context, engagementId),
      ]);
      setItems(
        data.items.map((item) => ({
          ...item,
          title: normalizeDisplayText(item.title),
        })),
      );
      setLibraryItems(
        library.items.map((item) => ({
          ...item,
          title: normalizeDisplayText(item.title),
          objective: normalizeDisplayText(item.objective),
        })),
      );
      setSelected((current) =>
        data.items.some((item) => item.id === current)
          ? current
          : data.items[0]?.id || "",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId]);
  const loadVersions = useCallback(
    async (id: string) => {
      if (!id) {
        setVersions([]);
        return;
      }
      setVersionsError("");
      try {
        setVersions(
          (await api.workingPaperVersions(context, engagementId, id)).items,
        );
      } catch (e) {
        setVersions([]);
        setVersionsError(errorText(e));
      }
    },
    [context, engagementId],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadVersions(selected);
  }, [loadVersions, selected]);
  useEffect(() => {
    const activePaper = items.find((item) => item.id === selected);
    if (!activePaper) return;
    const activeArea = workingPaperArea(activePaper.category_code);
    setOpenPaperGroups((current) =>
      current.includes(activeArea) ? current : [...current, activeArea],
    );
  }, [items, selected]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setActionError("");
    try {
      await api.createWorkingPaper(context, engagementId, {
        code: form.code,
        title: form.title,
        categoryCode: form.categoryCode,
        objective: form.objective,
        content: { narrative: form.content },
      });
      setForm({
        code: "",
        title: "",
        categoryCode: "PLANNING",
        objective: "",
        content: "",
      });
      setCreating(false);
      await load();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function save(paper: WorkingPaper, narrative: string) {
    setBusy(paper.id);
    setActionError("");
    try {
      await api.createWorkingPaperVersion(context, engagementId, paper.id, {
        narrative,
      });
      await load();
      await loadVersions(paper.id);
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function transition(paper: WorkingPaper, status: string) {
    setBusy(paper.id);
    setActionError("");
    try {
      await api.transitionWorkingPaper(context, engagementId, paper.id, status);
      await load();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function setApplicability(
    paper: WorkingPaper,
    applicability: "APPLICABLE" | "NOT_APPLICABLE",
    reason?: string,
  ) {
    setBusy(paper.id);
    setActionError("");
    try {
      await api.setWorkingPaperApplicability(context, engagementId, paper.id, {
        applicability,
        reason,
      });
      await load();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  if (libraryOpen)
    return (
      <WorkingPaperLibraryPanel
        context={context}
        engagementId={engagementId}
        onBack={() => setLibraryOpen(false)}
        onDeployed={load}
      />
    );
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={load} />;
  const paper = items.find((item) => item.id === selected);
  const latest =
    versions[0]?.content ?? paper?.content ?? versions.at(-1)?.content;
  const narrative =
    typeof latest?.narrative === "string" ? latest.narrative : "";
  const paperGroups = workingPaperAreas
    .map((area) => ({
      area,
      items: items.filter(
        (item) => workingPaperArea(item.category_code) === area,
      ),
    }))
    .filter((group) => group.items.length);
  const selectedLibraryItem = paper
    ? libraryItems.find(
        (item) =>
          item.deployedWorkingPaperId === paper.id ||
          (item.templateCode === paper.template_code &&
            item.templateVersion === paper.template_version),
      )
    : undefined;
  return (
    <section className="panel production-panel">
      <Head
        title="Working papers"
        body="Engagement evidence, preparation and independent review."
      >
        <div className="working-paper-head-actions">
          <Button appearance="primary" onClick={() => setLibraryOpen(true)}>
            Set up standard file
          </Button>
          <Button
            appearance="secondary"
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? "Close one-off form" : "Add one-off paper"}
          </Button>
        </div>
      </Head>
      {actionError && (
        <MessageBar intent="error">
          <MessageBarBody>{actionError}</MessageBarBody>
        </MessageBar>
      )}
      {creating && (
        <form className="production-form one-off-paper-form" onSubmit={create}>
          <div className="one-off-paper-guidance wide">
            <b>One-off engagement paper</b>
            <span>Use this only when the governed library has no suitable paper.</span>
          </div>
          <Field label="Reference" required>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="A1"
              required
            />
          </Field>
          <Field label="Title" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>
          <Field label="Work area" required>
            <Select
              value={form.categoryCode}
              onChange={(e) =>
                setForm({
                  ...form,
                  categoryCode: e.target.value as WorkingPaperCategory,
                })
              }
            >
              {workingPaperCategories.map((category) => (
                <option key={category} value={category}>
                  {pretty(category)}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="wide" label="Objective" required>
            <Textarea
              required
              maxLength={2000}
              rows={3}
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
            />
          </Field>
          <Field className="wide" label="Initial evidence">
            <Textarea
              rows={4}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </Field>
          <Button
            appearance="primary"
            type="submit"
            disabled={busy === "create"}
          >
            {busy === "create" ? "Creating…" : "Create paper"}
          </Button>
        </form>
      )}
      {!items.length ? (
        <Blank
          title="No working papers"
          body="Set up the governed standard file before adding any exceptional one-off papers."
        />
      ) : (
        <div className="production-split">
          <aside className="production-list" aria-label="Working papers">
            <Accordion
              multiple
              collapsible
              className="working-paper-navigation"
              openItems={openPaperGroups}
              onToggle={(_, data) =>
                setOpenPaperGroups(data.openItems.map(String))
              }
            >
              {paperGroups.map((group) => {
                const outstandingCount = group.items.filter(
                  (item) =>
                    item.applicability !== "NOT_APPLICABLE" &&
                    item.status !== "REVIEWED",
                ).length;
                return (
                  <AccordionItem
                    className="working-paper-group"
                    key={group.area}
                    value={group.area}
                  >
                    <AccordionHeader
                      button={{ className: "working-paper-group-trigger" }}
                    >
                      <span className="working-paper-group-heading">
                        <span>{group.area}</span>
                        <Badge
                          appearance="tint"
                          color={outstandingCount > 0 ? "informative" : "success"}
                          size="small"
                        >
                          {outstandingCount} outstanding
                        </Badge>
                      </span>
                    </AccordionHeader>
                    <AccordionPanel className="working-paper-group-panel">
                      <div className="working-paper-group-items">
                        {group.items.map((item) => {
                          const libraryItem = libraryItems.find(
                            (candidate) =>
                              candidate.deployedWorkingPaperId === item.id ||
                              (candidate.templateCode === item.template_code &&
                                candidate.templateVersion ===
                                  item.template_version),
                          );
                          const selectedItem = selected === item.id;
                          const statusLabel =
                            item.applicability === "NOT_APPLICABLE"
                              ? "Not applicable"
                              : item.status === "NOT_STARTED"
                                ? "Not started"
                                : pretty(item.status);
                          return (
                            <Button
                              appearance="subtle"
                              key={item.id}
                              className={`working-paper-item${selectedItem ? " active" : ""}`}
                              aria-current={selectedItem ? "page" : undefined}
                              onClick={() => setSelected(item.id)}
                            >
                              <span className="working-paper-item-copy">
                                <b>{item.code}</b>
                                {item.title}
                              </span>
                              <Badge
                                appearance="tint"
                                className="working-paper-status-badge"
                                color={
                                  item.applicability === "NOT_APPLICABLE" ||
                                  item.status === "NOT_STARTED"
                                    ? "subtle"
                                    : item.status === "REVIEWED"
                                      ? "success"
                                      : "informative"
                                }
                                size="small"
                              >
                                {statusLabel}
                              </Badge>
                              <small>
                                {pretty(item.category_code || "REPORTING")} ·{" "}
                                {libraryItem?.required
                                  ? "Required"
                                  : item.template_scope === "ENGAGEMENT"
                                    ? "One-off"
                                    : "Optional"} · v{item.current_version}
                              </small>
                            </Button>
                          );
                        })}
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </aside>
          {paper && (
            <WorkingPaperEditor
              key={`${paper.id}-${paper.current_version}-${narrative}`}
              context={context}
              engagementId={engagementId}
              paper={paper}
              libraryItem={selectedLibraryItem}
              initialNarrative={narrative}
              versions={versions}
              versionsError={versionsError}
              busy={busy === paper.id}
              save={(value) => save(paper, value)}
              transition={(status) => transition(paper, status)}
              setApplicability={(applicability, reason) =>
                setApplicability(paper, applicability, reason)
              }
              retryVersions={() => loadVersions(paper.id)}
            />
          )}
        </div>
      )}
    </section>
  );
}

const workingPaperCategories: WorkingPaperCategory[] = [
  "ACCEPTANCE", "PLANNING", "RECORDS", "INCOME", "EXPENDITURE",
  "ASSETS", "LIABILITIES", "FUNDS", "REPORTING", "COMPLETION",
];
function WorkingPaperLibraryPanel({
  context,
  engagementId,
  onBack,
  onDeployed,
}: EngagementProps & { onBack: () => void; onDeployed: () => Promise<void> }) {
  const [items, setItems] = useState<WorkingPaperLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"included" | "all">("included");
  const [editing, setEditing] = useState<WorkingPaperLibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [override, setOverride] = useState({
    scope: "CLIENT" as "PRACTICE" | "CLIENT",
    disposition: "INCLUDE" as "INCLUDE" | "EXCLUDE",
    title: "",
    objective: "",
    required: true,
    reason: "",
  });
  const [custom, setCustom] = useState({
    scope: "CLIENT" as "PRACTICE" | "CLIENT",
    code: "",
    categoryCode: "PLANNING" as WorkingPaperCategory,
    title: "",
    objective: "",
    required: false,
  });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setItems(
        (await api.workingPaperLibrary(context, engagementId)).items.map((item) => ({
          ...item,
          title: normalizeDisplayText(item.title),
          objective: normalizeDisplayText(item.objective),
        })),
      );
    }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [context, engagementId]);
  useEffect(() => { load(); }, [load]);
  function startEdit(item: WorkingPaperLibraryItem) {
    setEditing(item); setAdding(false);
    setOverride({
      scope: item.sourceScope === "PRACTICE" ? "PRACTICE" : "CLIENT",
      disposition: item.disposition,
      title: item.title,
      objective: item.objective,
      required: item.required,
      reason: item.overrideReason || "Tailored for this working paper set",
    });
  }
  async function saveOverride(event: React.FormEvent) {
    event.preventDefault(); if (!editing?.templateVersion) return;
    setBusy(true); setError("");
    try {
      await api.customiseWorkingPaperTemplate(context, engagementId, editing.templateCode, {
        ...override, templateVersion: editing.templateVersion,
      });
      setEditing(null); await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function addCustom(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api.createCustomWorkingPaperTemplate(context, engagementId, custom);
      setAdding(false); setCustom({ scope:"CLIENT",code:"",categoryCode:"PLANNING",title:"",objective:"",required:false }); await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function deploy() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.deployWorkingPaperLibrary(context, engagementId);
      setNotice(
        result.created
          ? `${result.created} accounts-production paper${result.created === 1 ? "" : "s"} deployed${result.replaced ? `; ${result.replaced} earlier version${result.replaced === 1 ? "" : "s"} retained as superseded` : ""}.`
          : "The applicable accounts-production set is already deployed.",
      );
      await Promise.all([load(),onDeployed()]);
    }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  const visible = mode === "included" ? items.filter((item) => item.disposition === "INCLUDE") : items;
  const visibleGroups = workingPaperAreas
    .map((area) => ({
      area,
      items: visible.filter((item) => workingPaperArea(item.categoryCode) === area),
    }))
    .filter((group) => group.items.length);
  return (
    <section className="panel production-panel working-paper-library">
      <Head title="Accounts-production working papers" body="A governed set assembled from core, reporting framework, sector, entity-form and client-specific layers.">
        <div className="working-paper-head-actions">
          <Button appearance="secondary" onClick={onBack}>Engagement file</Button>
          <Button appearance="secondary" onClick={() => { setAdding(true); setEditing(null); }}>Add client paper</Button>
          <Button appearance="primary" disabled={busy} onClick={deploy}>Deploy accounts-production set</Button>
        </div>
      </Head>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody><MessageBarActions><Button onClick={load}>Retry</Button></MessageBarActions></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}
      <div className="library-toolbar">
        <TabList selectedValue={mode} onTabSelect={(_, data) => setMode(data.value as "included" | "all")}>
          <Tab value="included">Applicable set</Tab><Tab value="all">Available additions</Tab>
        </TabList>
        <span>{visible.length} papers</span>
      </div>
      {(editing || adding) && (
        <form className="production-form library-form" onSubmit={editing ? saveOverride : addCustom}>
          <Field label="Apply to"><Select value={(editing ? override : custom).scope} onChange={(e) => editing ? setOverride({...override,scope:e.target.value as "PRACTICE"|"CLIENT"}) : setCustom({...custom,scope:e.target.value as "PRACTICE"|"CLIENT"})}><option value="CLIENT">This client</option><option value="PRACTICE">Practice standard</option></Select></Field>
          {editing ? <>
            <Field label="Set membership"><Select value={override.disposition} onChange={(e)=>setOverride({...override,disposition:e.target.value as "INCLUDE"|"EXCLUDE"})}><option value="INCLUDE">Include</option><option value="EXCLUDE">Exclude</option></Select></Field>
            <Field label="Requirement"><Checkbox label="Required in the standard set" checked={override.required} onChange={(_,data)=>setOverride({...override,required:data.checked === true})}/></Field>
            <Field label="Title"><Input value={override.title} onChange={(e)=>setOverride({...override,title:e.target.value})}/></Field>
            <Field className="wide" label="Objective"><Textarea rows={2} value={override.objective} onChange={(e)=>setOverride({...override,objective:e.target.value})}/></Field>
            <Field className="wide" label="Reason" required><Input required value={override.reason} onChange={(e)=>setOverride({...override,reason:e.target.value})}/></Field>
          </> : <>
            <Field label="Reference" required><Input required value={custom.code} onChange={(e)=>setCustom({...custom,code:e.target.value.toUpperCase()})}/></Field>
            <Field label="Category"><Select value={custom.categoryCode} onChange={(e)=>setCustom({...custom,categoryCode:e.target.value as WorkingPaperCategory})}>{workingPaperCategories.map((category)=><option key={category} value={category}>{pretty(category)}</option>)}</Select></Field>
            <Field label="Requirement"><Checkbox label="Required in the standard set" checked={custom.required} onChange={(_,data)=>setCustom({...custom,required:data.checked === true})}/></Field>
            <Field label="Title" required><Input required value={custom.title} onChange={(e)=>setCustom({...custom,title:e.target.value})}/></Field>
            <Field className="wide" label="Objective" required><Textarea required rows={2} value={custom.objective} onChange={(e)=>setCustom({...custom,objective:e.target.value})}/></Field>
          </>}
          <div className="library-form-actions"><Button type="button" onClick={()=>{setEditing(null);setAdding(false);}}>Cancel</Button><Button appearance="primary" type="submit" disabled={busy}>Save</Button></div>
        </form>
      )}
      <div className="table-wrap">
        <Table size="small" aria-label="Accounts-production working-paper library">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Reference</TableHeaderCell>
              <TableHeaderCell>Working paper</TableHeaderCell>
              <TableHeaderCell>Layer</TableHeaderCell>
              <TableHeaderCell>Source and version</TableHeaderCell>
              <TableHeaderCell>Requirement</TableHeaderCell>
              <TableHeaderCell>Applicability</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleGroups.map((group) => (
              <React.Fragment key={group.area}>
                <TableRow className="library-group-row">
                  <TableCell colSpan={7}>
                    <b>{group.area}</b>
                    <span>{group.items.length} papers</span>
                  </TableCell>
                </TableRow>
                {group.items.map((item) => (
                  <TableRow key={item.templateCode}>
                    <TableCell>{item.code}</TableCell>
                    <TableCell>
                      <b>{item.title}</b>
                      <span className="library-objective">{item.objective}</span>
                    </TableCell>
                    <TableCell><Badge appearance="outline">{pretty(item.applicabilityLayer)}</Badge></TableCell>
                    <TableCell>
                      {item.serviceFamily === "CUSTOM" ? `${pretty(item.sourceScope)}-authored` : "Accounts production"} · {item.templateVersion ? `v${item.templateVersion}` : "Custom"}
                    </TableCell>
                    <TableCell><Badge appearance="outline" color={item.required ? "brand" : "subtle"}>{item.required ? "Required" : "Optional"}</Badge></TableCell>
                    <TableCell>
                      <Badge
                        appearance="outline"
                        color={item.disposition === "EXCLUDE" ? "subtle" : item.deployedWorkingPaperId ? "success" : "informative"}
                      >
                        {item.disposition === "EXCLUDE"
                          ? "Excluded"
                          : item.deployedWorkingPaperId
                            ? pretty(item.deployedApplicability || "APPLICABLE")
                            : "Not deployed"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.templateVersion ? (
                        <Button size="small" appearance="secondary" onClick={() => startEdit(item)}>
                          Customise
                        </Button>
                      ) : (
                        <span>Custom</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function WorkingPaperEditor({
  context,
  engagementId,
  paper,
  libraryItem,
  initialNarrative,
  versions,
  versionsError,
  busy,
  save,
  transition,
  setApplicability,
  retryVersions,
}: {
  context: ApiContext;
  engagementId: string;
  paper: WorkingPaper;
  libraryItem?: WorkingPaperLibraryItem;
  initialNarrative: string;
  versions: WorkingPaperVersion[];
  versionsError: string;
  busy: boolean;
  save: (value: string) => void;
  transition: (status: string) => void;
  setApplicability: (
    applicability: "APPLICABLE" | "NOT_APPLICABLE",
    reason?: string,
  ) => void;
  retryVersions: () => void;
}) {
  const [narrative, setNarrative] = useState(initialNarrative);
  const [notApplicableOpen, setNotApplicableOpen] = useState(false);
  const [notApplicableReason, setNotApplicableReason] = useState("");
  const locked = paper.applicability === "NOT_APPLICABLE" || ["PREPARED", "REVIEWED", "SUPERSEDED"].includes(paper.status);
  return (
    <div className="paper-editor">
      <header>
        <div>
          <p className="mono">
            {paper.code} · v{paper.current_version}
          </p>
          <h3>{paper.title}</h3>
        </div>
        <Badge
          appearance="outline"
          color={paper.status === "REVIEWED" ? "success" : "informative"}
        >
          {pretty(paper.status)}
        </Badge>
      </header>
      <dl className="working-paper-metadata">
        <div>
          <dt>Work area</dt>
          <dd>{workingPaperArea(paper.category_code)}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>{pretty(paper.category_code || "REPORTING")}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {paper.template_scope === "ENGAGEMENT"
              ? "One-off engagement paper"
              : `${pretty(paper.template_scope || libraryItem?.sourceScope || "STANDARD")} library`}
          </dd>
        </div>
        <div>
          <dt>Template version</dt>
          <dd>{paper.template_version ? `Version ${paper.template_version}` : "Not template based"}</dd>
        </div>
        <div>
          <dt>Requirement</dt>
          <dd>{libraryItem?.required ? "Required" : paper.template_scope === "ENGAGEMENT" ? "One-off" : "Optional"}</dd>
        </div>
        <div>
          <dt>Applicability</dt>
          <dd>{pretty(paper.applicability || "APPLICABLE")}</dd>
        </div>
        <div>
          <dt>Preparer</dt>
          <dd>{paper.prepared_by ? "Sign-off recorded" : "Not recorded"}</dd>
        </div>
        <div>
          <dt>Reviewer</dt>
          <dd>{paper.reviewed_by ? "Sign-off recorded" : "Not recorded"}</dd>
        </div>
      </dl>
      {paper.objective && (
        <section className="working-paper-objective" aria-label="Working paper objective">
          <b>Objective</b>
          <p>{paper.objective}</p>
        </section>
      )}
      <Field label="Evidence narrative">
        <Textarea
          rows={10}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          disabled={locked}
        />
      </Field>
      {paper.applicability === "NOT_APPLICABLE" && (
        <MessageBar intent="info"><MessageBarBody><b>Not applicable.</b> {paper.not_applicable_reason}</MessageBarBody></MessageBar>
      )}
      {notApplicableOpen && (
        <div className="not-applicable-form"><Field label="Reason" required><Textarea rows={2} value={notApplicableReason} onChange={(e)=>setNotApplicableReason(e.target.value)} /></Field><Button onClick={()=>setNotApplicableOpen(false)}>Cancel</Button><Button appearance="primary" disabled={!notApplicableReason.trim()} onClick={()=>setApplicability("NOT_APPLICABLE",notApplicableReason)}>Confirm not applicable</Button></div>
      )}
      <div className="editor-actions">
        {paper.template_scope && paper.template_scope !== "ENGAGEMENT" && paper.applicability !== "NOT_APPLICABLE" && !notApplicableOpen && (
          <Button appearance="secondary" disabled={busy} onClick={()=>setNotApplicableOpen(true)}>Mark not applicable</Button>
        )}
        {paper.applicability === "NOT_APPLICABLE" && (
          <Button appearance="secondary" disabled={busy} onClick={()=>setApplicability("APPLICABLE")}>Restore to file</Button>
        )}
        {!locked && (
          <Button
            disabled={busy || narrative === initialNarrative}
            onClick={() => save(narrative)}
          >
            Save new version
          </Button>
        )}
        {paper.status === "NOT_STARTED" && (
          <Button
            appearance="primary"
            disabled={busy}
            onClick={() => transition("IN_PROGRESS")}
          >
            Start preparation
          </Button>
        )}
        {paper.status === "IN_PROGRESS" && (
          <Button
            appearance="primary"
            disabled={busy}
            onClick={() => transition("PREPARED")}
          >
            Mark prepared
          </Button>
        )}
        {paper.status === "PREPARED" && (
          <Button
            appearance="primary"
            disabled={busy}
            onClick={() => transition("REVIEWED")}
          >
            Mark reviewed
          </Button>
        )}
      </div>
      <WorkingPaperGovernancePanel
        context={context}
        engagementId={engagementId}
        paper={paper}
      />
      <Accordion
        collapsible
        defaultOpenItems={["version-history"]}
        className="version-history"
      >
        <AccordionItem value="version-history">
          <AccordionHeader
            button={{ className: "version-history-trigger" }}
          >
            Immutable version history ({versions.length})
          </AccordionHeader>
          <AccordionPanel>
            {versionsError ? (
              <ErrorPanel message={versionsError} retry={retryVersions} />
            ) : !versions.length ? (
              <p>No saved versions were returned.</p>
            ) : (
              <ol>
                {[...versions]
                  .sort((a, b) => b.version - a.version)
                  .map((version) => (
                    <li key={version.id}>
                      <div>
                        <b>Version {version.version}</b>
                        <small>{when(version.created_at)}</small>
                      </div>
                      <span>Integrity recorded</span>
                    </li>
                  ))}
              </ol>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function WorkingPaperGovernancePanel({
  context,
  engagementId,
  paper,
}: EngagementProps & { paper: WorkingPaper }) {
  const [catalogue, setCatalogue] =
    useState<WorkingPaperGovernanceCatalogue | null>(null);
  const [governance, setGovernance] =
    useState<WorkingPaperGovernance | null>(null);
  const [risks, setRisks] = useState<WorkingPaperRisk[]>([]);
  const [attachments, setAttachments] = useState<WorkingPaperAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [themeCode, setThemeCode] = useState("");
  const [themePrimary, setThemePrimary] = useState(false);
  const [assertionCode, setAssertionCode] = useState("");
  const [riskId, setRiskId] = useState("");
  const [reportLineId, setReportLineId] = useState("");
  const [linkPurpose, setLinkPurpose] =
    useState<"PRIMARY" | "SUPPORTING" | "DISCLOSURE">("SUPPORTING");
  const [linksVerified, setLinksVerified] = useState(false);
  const [correction, setCorrection] = useState<{
    kind: "theme" | "assertion" | "risk" | "report-line";
    linkId: string;
    currentValue: string;
    label: string;
  } | null>(null);
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [creatingRisk, setCreatingRisk] = useState(false);
  const [riskForm, setRiskForm] = useState({
    riskCode: "",
    title: "",
    riskLevel: "MEDIUM" as WorkingPaperRisk["riskLevel"],
    description: "",
    response: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] =
    useState<WorkingPaperAttachment["evidenceType"]>("SOURCE_DOCUMENT");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogueData, governanceData, riskData, attachmentData] =
        await Promise.all([
          api.workingPaperGovernanceCatalogue(context, engagementId),
          api.workingPaperGovernance(context, engagementId, paper.id),
          api.workingPaperRisks(context, engagementId),
          api.workingPaperAttachments(context, engagementId, paper.id),
        ]);
      setCatalogue(catalogueData.item);
      setGovernance(governanceData.item);
      setRisks(riskData.items);
      setAttachments(attachmentData.items);
      setThemeCode((current) => current || catalogueData.item.themes[0]?.code || "");
      setAssertionCode(
        (current) => current || catalogueData.item.assertions[0] || "",
      );
      setRiskId((current) => current || riskData.items[0]?.id || "");
      setReportLineId(
        (current) => current || catalogueData.item.reportLines[0]?.id || "",
      );
      setEvidenceType(
        (current) =>
          catalogueData.item.evidence.evidenceTypes.includes(current)
            ? current
            : catalogueData.item.evidence.evidenceTypes[0] || "OTHER",
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId, paper.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(label);
      await load();
      return true;
    } catch (cause) {
      setError(errorText(cause));
      return false;
    } finally {
      setBusy("");
    }
  }

  function beginCorrection(
    kind: "theme" | "assertion" | "risk" | "report-line",
    linkId: string,
    currentValue: string,
    label: string,
  ) {
    setCorrection({ kind, linkId, currentValue, label });
    setCorrectionValue("");
    setCorrectionReason("");
  }

  async function replaceLink(event: React.FormEvent) {
    event.preventDefault();
    if (!correction || !correctionValue || !correctionReason.trim()) return;
    const reason = correctionReason.trim();
    const replaced = await act("Governance link corrected", () => {
      if (correction.kind === "theme")
        return api.replaceWorkingPaperTheme(context, engagementId, paper.id, correction.linkId, correctionValue, reason);
      if (correction.kind === "assertion")
        return api.replaceWorkingPaperAssertion(context, engagementId, paper.id, correction.linkId, correctionValue, reason);
      if (correction.kind === "risk")
        return api.replaceWorkingPaperRisk(context, engagementId, paper.id, correction.linkId, correctionValue, reason);
      return api.replaceWorkingPaperReportLine(context, engagementId, paper.id, correction.linkId, correctionValue, reason);
    });
    if (replaced) {
      setCorrection(null);
      setCorrectionValue("");
      setCorrectionReason("");
    }
  }

  async function addPermanentLink(
    label: string,
    action: () => Promise<unknown>,
  ) {
    setLinksVerified(false);
    await act(label, action);
  }

  async function createRisk(event: React.FormEvent) {
    event.preventDefault();
    await act("Risk added", async () => {
      const result = await api.createWorkingPaperRisk(context, engagementId, {
        ...riskForm,
        riskCode: riskForm.riskCode.trim().toUpperCase(),
        title: riskForm.title.trim(),
      });
      setRiskId(result.item.id);
      setRiskForm({
        riskCode: "",
        title: "",
        riskLevel: "MEDIUM",
        description: "",
        response: "",
      });
      setCreatingRisk(false);
    });
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !catalogue) return;
    if (file.size === 0 || file.size > catalogue.evidence.maxBytes) {
      setError("Choose a non-empty evidence file no larger than 10 MiB.");
      return;
    }
    if (!catalogue.evidence.mediaTypes.includes(file.type)) {
      setError("This evidence file type is not supported.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("workingPaperVersion", String(paper.current_version));
    form.append("evidenceType", evidenceType);
    if (description.trim()) form.append("description", description.trim());
    await act("Evidence uploaded", async () => {
      await api.uploadWorkingPaperAttachment(
        context,
        engagementId,
        paper.id,
        form,
      );
      setFile(null);
      setDescription("");
    });
  }

  async function download(attachment: WorkingPaperAttachment) {
    await act("Evidence download prepared", async () => {
      const blob = await api.workingPaperAttachmentBlob(
        context,
        attachment.contentPath,
        true,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    });
  }

  if (loading)
    return (
      <div className="working-paper-governance-loading" role="status">
        Loading governance and evidence…
      </div>
    );
  if (!catalogue || !governance)
    return (
      <MessageBar intent="warning">
        <MessageBarBody>
          <b>Governed links and evidence are unavailable.</b> {error}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={load}>
            Retry
          </Button>
        </MessageBarActions>
      </MessageBar>
    );

  return (
    <section className="working-paper-governance" aria-label="Governance and evidence">
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {notice && (
        <div className="sr-only" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <Accordion multiple collapsible defaultOpenItems={["governance", "evidence"]}>
        <AccordionItem value="governance">
          <AccordionHeader>Governance links</AccordionHeader>
          <AccordionPanel>
            <p className="governance-note" id={`permanent-link-guidance-${paper.id}`}>
              Links form part of the audit trail. If a selection is wrong, replace
              it with an audited correction and record the reason.
            </p>
            <Checkbox
              label="I have verified this governance link"
              checked={linksVerified}
              onChange={(_, data) => setLinksVerified(data.checked === true)}
            />
            <div className="governance-link-grid">
              <Field label="Theme">
                <Select value={themeCode} onChange={(e) => setThemeCode(e.target.value)}>
                  {catalogue.themes.map((theme) => (
                    <option key={theme.code} value={theme.code}>{theme.title}</option>
                  ))}
                </Select>
              </Field>
              <Checkbox
                label="Primary theme"
                checked={themePrimary}
                onChange={(_, data) => setThemePrimary(data.checked === true)}
              />
              <Button
                appearance="secondary"
                disabled={!themeCode || !linksVerified || !!busy}
                aria-describedby={`permanent-link-guidance-${paper.id}`}
                onClick={() => addPermanentLink("Theme linked", () => api.linkWorkingPaperTheme(context, engagementId, paper.id, themeCode, themePrimary))}
              >
                Link theme
              </Button>
              <Field label="Assertion">
                <Select value={assertionCode} onChange={(e) => setAssertionCode(e.target.value)}>
                  {catalogue.assertions.map((assertion) => (
                    <option key={assertion} value={assertion}>{pretty(assertion)}</option>
                  ))}
                </Select>
              </Field>
              <Button
                appearance="secondary"
                disabled={!assertionCode || !linksVerified || !!busy}
                aria-describedby={`permanent-link-guidance-${paper.id}`}
                onClick={() => addPermanentLink("Assertion linked", () => api.linkWorkingPaperAssertion(context, engagementId, paper.id, assertionCode))}
              >
                Link assertion
              </Button>
              <Field label="Engagement risk">
                <Select value={riskId} onChange={(e) => setRiskId(e.target.value)}>
                  <option value="">Select a risk</option>
                  {risks.map((risk) => (
                    <option key={risk.id} value={risk.id}>{risk.riskCode} · {risk.title}</option>
                  ))}
                </Select>
              </Field>
              <Button
                appearance="secondary"
                disabled={!riskId || !linksVerified || !!busy}
                aria-describedby={`permanent-link-guidance-${paper.id}`}
                onClick={() => addPermanentLink("Risk linked", () => api.linkWorkingPaperRisk(context, engagementId, paper.id, riskId))}
              >
                Link risk
              </Button>
              <Button appearance="subtle" onClick={() => setCreatingRisk((value) => !value)}>
                {creatingRisk ? "Close risk form" : "Add engagement risk"}
              </Button>
              <Field label="Statement line">
                <Select value={reportLineId} onChange={(e) => setReportLineId(e.target.value)}>
                  {catalogue.reportLines.map((line) => (
                    <option key={line.id} value={line.id}>{line.statementCode} · {line.caption}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Link purpose">
                <Select value={linkPurpose} onChange={(e) => setLinkPurpose(e.target.value as typeof linkPurpose)}>
                  <option value="PRIMARY">Primary</option>
                  <option value="SUPPORTING">Supporting</option>
                  <option value="DISCLOSURE">Disclosure</option>
                </Select>
              </Field>
              <Button
                appearance="secondary"
                disabled={!reportLineId || !linksVerified || !!busy}
                aria-describedby={`permanent-link-guidance-${paper.id}`}
                onClick={() => addPermanentLink("Statement line linked", () => api.linkWorkingPaperReportLine(context, engagementId, paper.id, reportLineId, linkPurpose))}
              >
                Link statement line
              </Button>
            </div>
            {creatingRisk && (
              <form className="risk-create-form" onSubmit={createRisk}>
                <Field label="Risk reference" required>
                  <Input required maxLength={80} value={riskForm.riskCode} onChange={(e) => setRiskForm({ ...riskForm, riskCode: e.target.value })} />
                </Field>
                <Field label="Risk title" required>
                  <Input required maxLength={255} value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} />
                </Field>
                <Field label="Risk level">
                  <Select value={riskForm.riskLevel} onChange={(e) => setRiskForm({ ...riskForm, riskLevel: e.target.value as WorkingPaperRisk["riskLevel"] })}>
                    {(["LOW", "MEDIUM", "HIGH", "SIGNIFICANT"] as const).map((level) => <option key={level} value={level}>{pretty(level)}</option>)}
                  </Select>
                </Field>
                <Field className="wide" label="Description">
                  <Textarea rows={2} maxLength={4000} value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} />
                </Field>
                <Field className="wide" label="Planned response">
                  <Textarea rows={2} maxLength={4000} value={riskForm.response} onChange={(e) => setRiskForm({ ...riskForm, response: e.target.value })} />
                </Field>
                <Button appearance="primary" type="submit" disabled={!!busy}>Add risk</Button>
              </form>
            )}
            <div className="governance-registers">
              <GovernanceRegister title="Themes" items={governance.themes.map((item) => ({ id: item.id, label: `${item.title}${item.isPrimary ? " · Primary" : ""}`, value: item.themeCode }))} onCorrect={(item) => beginCorrection("theme", item.id, item.value, item.label)} />
              <GovernanceRegister title="Assertions" items={governance.assertions.map((item) => ({ id: item.id, label: pretty(item.assertionCode), value: item.assertionCode }))} onCorrect={(item) => beginCorrection("assertion", item.id, item.value, item.label)} />
              <GovernanceRegister title="Risks" items={governance.risks.map((item) => ({ id: item.id, label: `${item.riskCode} · ${item.title} · ${pretty(item.riskLevel)}`, value: item.riskId }))} onCorrect={(item) => beginCorrection("risk", item.id, item.value, item.label)} />
              <GovernanceRegister title="Statement lines" items={governance.reportLines.map((item) => ({ id: item.id, label: `${item.statementCode} · ${item.caption} · ${pretty(item.linkPurpose)}`, value: item.reportLineId }))} onCorrect={(item) => beginCorrection("report-line", item.id, item.value, item.label)} />
            </div>
            {correction && (
              <form className="risk-create-form" onSubmit={replaceLink} aria-label={`Correct ${correction.label}`}>
                <div className="wide">
                  <b>Correct governance link</b>
                  <p>Replacing: {correction.label}</p>
                </div>
                <Field label="Replacement" required>
                  <Select required value={correctionValue} onChange={(event) => setCorrectionValue(event.target.value)}>
                    <option value="">Select a replacement</option>
                    {correction.kind === "theme" && catalogue.themes.filter((item) => item.code !== correction.currentValue).map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
                    {correction.kind === "assertion" && catalogue.assertions.filter((item) => item !== correction.currentValue).map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
                    {correction.kind === "risk" && risks.filter((item) => item.id !== correction.currentValue).map((item) => <option key={item.id} value={item.id}>{item.riskCode} · {item.title}</option>)}
                    {correction.kind === "report-line" && catalogue.reportLines.filter((item) => item.id !== correction.currentValue).map((item) => <option key={item.id} value={item.id}>{item.statementCode} · {item.caption}</option>)}
                  </Select>
                </Field>
                <Field className="wide" label="Correction reason" required hint="Recorded in the audit trail.">
                  <Textarea required rows={2} maxLength={2000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} />
                </Field>
                <Button appearance="primary" type="submit" disabled={!correctionValue || !correctionReason.trim() || !!busy}>Replace link</Button>
                <Button appearance="secondary" type="button" disabled={!!busy} onClick={() => setCorrection(null)}>Cancel</Button>
              </form>
            )}
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="evidence">
          <AccordionHeader>Evidence attachments ({attachments.length})</AccordionHeader>
          <AccordionPanel>
            <form className="evidence-upload-form" onSubmit={upload}>
              <Field label="Evidence file" required>
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    className="evidence-file-input"
                    type="file"
                    required
                    accept={catalogue.evidence.mediaTypes.join(",")}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                )}
              </Field>
              <Field label="Evidence type">
                <Select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as WorkingPaperAttachment["evidenceType"])}>
                  {catalogue.evidence.evidenceTypes.map((type) => <option key={type} value={type}>{pretty(type)}</option>)}
                </Select>
              </Field>
              <Field className="wide" label="Description">
                <Input maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Button appearance="primary" type="submit" disabled={!file || !!busy || !catalogue.evidence.uploadAvailable}>
                {busy === "Evidence uploaded" ? "Uploading…" : "Upload evidence"}
              </Button>
            </form>
            {!attachments.length ? (
              <p className="governance-empty">No evidence attachments have been recorded.</p>
            ) : (
              <div className="table-wrap evidence-attachment-table">
                <Table size="small" aria-label="Working paper evidence attachments">
                  <TableHeader><TableRow><TableHeaderCell>File</TableHeaderCell><TableHeaderCell>Type</TableHeaderCell><TableHeaderCell>Version</TableHeaderCell><TableHeaderCell>Size</TableHeaderCell><TableHeaderCell>Recorded</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader>
                  <TableBody>
                    {attachments.map((attachment) => (
                      <TableRow key={attachment.id}>
                        <TableCell><b>{attachment.filename}</b>{attachment.description && <span className="attachment-description">{attachment.description}</span>}</TableCell>
                        <TableCell>{pretty(attachment.evidenceType)}</TableCell>
                        <TableCell>{attachment.workingPaperVersion}</TableCell>
                        <TableCell>{formatEvidenceBytes(attachment.byteSize)}</TableCell>
                        <TableCell>{when(attachment.uploadedAt)}</TableCell>
                        <TableCell><Button size="small" appearance="secondary" disabled={!!busy} onClick={() => download(attachment)}>Download</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

type GovernanceRegisterItem = { id: string; label: string; value: string };

function GovernanceRegister({
  title,
  items,
  onCorrect,
}: {
  title: string;
  items: GovernanceRegisterItem[];
  onCorrect: (item: GovernanceRegisterItem) => void;
}) {
  return (
    <section>
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>{" "}
              <Button size="small" appearance="subtle" onClick={() => onCorrect(item)}>
                Correct
              </Button>
            </li>
          ))}
        </ul>
      ) : <p>None linked</p>}
    </section>
  );
}

function formatEvidenceBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Disclosures({
  context,
  engagementId,
  framework,
  sectorProfile = "NONE",
  periodStart = "",
  periodEnd = "",
  report = [],
  trialBalance = [],
}: Pick<
  Props,
  | "context"
  | "engagementId"
  | "framework"
  | "sectorProfile"
  | "periodStart"
  | "periodEnd"
  | "report"
  | "trialBalance"
>) {
  const [items, setItems] = useState<Disclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await api.disclosures(context, engagementId)).items);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId]);
  useEffect(() => {
    load();
  }, [load]);
  async function save(
    item: ScopedDisclosure,
    applicability: string,
    status: string,
    answer: string,
    explanation: string,
  ) {
    setBusy(item.id);
    setActionError("");
    try {
      const answerField = disclosureAnswerField(item.disclosure_code);
      const nextAnswer = {
        ...(item.answer || {}),
        [answerField]: answer,
        explanation,
      };
      if (item.record_state === "NOT_RECORDED") {
        const created = await api.createDisclosure(context, engagementId, {
          disclosureCode: item.disclosure_code,
          applicability: applicability as Disclosure["applicability"],
          ruleVersion: "2026.1",
          answer: nextAnswer,
        });
        if (status !== "OPEN" && status !== "NOT_RECORDED")
          await api.updateDisclosure(context, engagementId, created.item.id, {
            status,
          });
        await load();
        return;
      }
      const changed =
        answer !== answerText(item.answer) ||
        explanation !== explanationText(item.answer);
      if (changed)
        await api.createDisclosureVersion(
          context,
          engagementId,
          item.id,
          nextAnswer,
        );
      await api.updateDisclosure(context, engagementId, item.id, {
        applicability,
        status: changed && status === "REVIEWED" ? "COMPLETE" : status,
      });
      await load();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={load} />;
  const scoped = scopeDisclosureChecklist({
    framework,
    sectorProfile,
    periodStart,
    periodEnd,
    report,
    trialBalance,
    existing: items,
  });
  const completed = scoped.items.filter((item) =>
    ["COMPLETE", "REVIEWED"].includes(item.status),
  ).length;
  return (
    <section className="panel production-panel">
      <Head
        title="Disclosure checklist"
        body="Statutory requirements scoped from the reporting regime, period, balances and recorded client facts."
      >
        <div className="disclosure-scope-summary">
          {scoped.tier && <Badge appearance="outline">{scoped.tier}</Badge>}
          <Badge appearance="outline">
            Gross income{" "}
            {new Intl.NumberFormat("en-GB", {
              style: "currency",
              currency: "GBP",
              maximumFractionDigits: 0,
            }).format(scoped.grossIncome)}
          </Badge>
          <Badge appearance="outline">
            {completed} of {scoped.items.length} reviewed
          </Badge>
        </div>
      </Head>
      {actionError && (
        <MessageBar intent="error">
          <MessageBarBody>{actionError}</MessageBarBody>
        </MessageBar>
      )}
      {!scoped.items.length ? (
        <Blank
          title="No disclosure requirements"
          body="Checklist requirements will appear when the framework pack is available for this engagement."
        />
      ) : (
        <div className="disclosure-list">
          {scoped.items.map((item) => (
            <DisclosureRow
              key={`${item.id}-${item.current_version}`}
              item={item}
              busy={busy === item.id}
              save={(...values) => save(item, ...values)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
function DisclosureRow({
  item,
  busy,
  save,
}: {
  item: ScopedDisclosure;
  busy: boolean;
  save: (
    applicability: string,
    status: string,
    answer: string,
    explanation: string,
  ) => void;
}) {
  const [applicability, setApplicability] = useState(item.applicability);
  const [status, setStatus] = useState(item.status);
  const [answer, setAnswer] = useState(answerText(item.answer));
  const [explanation, setExplanation] = useState(explanationText(item.answer));
  const placeholders = unresolvedDisclosurePlaceholders(answer);
  const completionBlocked =
    ["COMPLETE", "REVIEWED"].includes(status) && placeholders.length > 0;
  return (
    <article className="disclosure-row">
      <header>
        <div>
          <b>{item.title || pretty(item.disclosure_code)}</b>
          <small>
            {item.requirement_source || `Rule ${item.rule_version || "current"}`}
            {item.trigger_summary ? ` · ${item.trigger_summary}` : ""}
          </small>
        </div>
        <div className="disclosure-row-status">
          {item.rendered_in_accounts && (
            <Badge appearance="outline" color="informative">
              Shown in accounts
            </Badge>
          )}
          <Badge
            appearance="outline"
            color={
              item.status === "REVIEWED"
                ? "success"
                : item.sync_status === "ASSESSMENT_REQUIRED"
                  ? "warning"
                  : "informative"
            }
          >
            {item.sync_status === "BASELINE_WORDING"
              ? "Baseline wording"
              : item.sync_status === "ASSESSMENT_REQUIRED"
                ? "Assessment needed"
                : pretty(item.status)}
          </Badge>
        </div>
      </header>
      <div className="disclosure-fields">
        <Field label="Applicability">
          <Select
            value={applicability}
            onChange={(e) =>
              setApplicability(e.target.value as Disclosure["applicability"])
            }
          >
            {[
              "UNASSESSED",
              "REQUIRED",
              "RECOMMENDED",
              "NOT_APPLICABLE",
              "PROHIBITED",
            ].map((value) => (
              <option key={value} value={value}>
                {pretty(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Disclosure["status"])}
          >
            {status === "NOT_RECORDED" && (
              <option value="NOT_RECORDED" disabled>
                Not recorded
              </option>
            )}
            {["OPEN", "COMPLETE", "REVIEWED"].map((value) => (
              <option key={value} value={value}>
                {pretty(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          className="wide"
          label={
            item.rendered_in_accounts
              ? "Disclosure text (synced to accounts)"
              : "Assessment or disclosure text"
          }
          validationState={placeholders.length > 0 ? "warning" : "none"}
          validationMessage={
            placeholders.length > 0
              ? `${placeholders.length} item${placeholders.length === 1 ? "" : "s"} to complete: ${placeholders.join(" · ")}`
              : undefined
          }
        >
          <Textarea
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </Field>
        <Field
          className="wide"
          label="Explanation"
          required={applicability === "NOT_APPLICABLE"}
        >
          <Textarea
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            required={applicability === "NOT_APPLICABLE"}
          />
        </Field>
      </div>
      <Button
        appearance="primary"
        disabled={busy || completionBlocked}
        onClick={() => save(applicability, status, answer, explanation)}
      >
        {busy ? "Saving…" : "Save assessment"}
      </Button>
      {completionBlocked && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Replace every bracketed placeholder before marking this disclosure {pretty(status)}.
          </MessageBarBody>
        </MessageBar>
      )}
    </article>
  );
}

export function accountsReleaseChecks(version: AccountsVersion) {
  const active = new Set(
    (version.signoffs || [])
      .filter((item) => !item.invalidated_at)
      .map((item) => item.signoff_type),
  );
  return [
    {
      label: "Content manifest recorded",
      complete: Boolean(
        version.content_hash &&
        Object.keys(version.content_manifest || {}).length,
      ),
      evidence: version.content_hash
        ? "Manifest hash recorded"
        : "Manifest hash unavailable",
    },
    {
      label: "Prepared sign-off",
      complete: active.has("PREPARED"),
      evidence: active.has("PREPARED")
        ? "Recorded for this version"
        : "Required before review",
    },
    {
      label: "Independent review",
      complete: active.has("REVIEWED"),
      evidence: active.has("REVIEWED")
        ? "Reviewed sign-off recorded"
        : "Reviewed sign-off outstanding",
    },
    {
      label: "Partner approval",
      complete: active.has("PARTNER_APPROVED"),
      evidence: active.has("PARTNER_APPROVED")
        ? "Partner approval recorded"
        : "Required before approval",
    },
    {
      label: "Client approval",
      complete: active.has("CLIENT_APPROVED"),
      evidence: active.has("CLIENT_APPROVED")
        ? "Client approval recorded"
        : "Required before finalisation",
    },
    {
      label: "Filing authority",
      complete: active.has("FILING_AUTHORISED"),
      evidence: active.has("FILING_AUTHORISED")
        ? "Filing may be prepared"
        : "Required before filing preparation",
    },
  ];
}

function AccountsReviewDetail({
  version,
  previous,
}: {
  version: AccountsVersion;
  previous?: AccountsVersion;
}) {
  const checks = accountsReleaseChecks(version);
  const complete = checks.filter((item) => item.complete).length;
  const manifest = Object.entries(version.content_manifest || {});
  return (
    <section
      className="accounts-review"
      aria-labelledby={`review-${version.id}`}
    >
      <div className="review-heading">
        <div>
          <p className="eyebrow">Final-accounts review</p>
          <h4 id={`review-${version.id}`}>Release evidence</h4>
        </div>
        <strong
          aria-label={`${complete} of ${checks.length} release checks complete`}
        >
          {complete}/{checks.length} complete
        </strong>
      </div>
      <div className="review-progress" aria-hidden="true">
        <span style={{ width: `${(complete / checks.length) * 100}%` }} />
      </div>
      <ul className="release-checks">
        {checks.map((check) => (
          <li
            key={check.label}
            className={check.complete ? "complete" : "outstanding"}
          >
            <span aria-hidden="true">
              {check.complete ? <CheckmarkRegular /> : <WarningRegular />}
            </span>
            <div>
              <b>{check.label}</b>
              <small>{check.evidence}</small>
            </div>
          </li>
        ))}
      </ul>
      <Accordion collapsible className="manifest-review">
        <AccordionItem value="manifest-review">
          <AccordionHeader>
            Review generated content and provenance ({manifest.length} entries)
          </AccordionHeader>
          <AccordionPanel>
            {manifest.length ? (
              <dl>
                {manifest.map(([key, value]) => (
                  <div key={key}>
                    <dt>{pretty(key)}</dt>
                    <dd>
                      {Array.isArray(value)
                        ? value.join(" · ")
                        : typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">
                No manifest evidence was returned for this version.
              </p>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
      {previous && (
        <div className="version-comparison" role="note">
          <b>Compared with version {previous.version}</b>
          <span>
            {previous.content_hash === version.content_hash
              ? "Content is unchanged."
              : "Content changed — re-review and fresh sign-offs are required."}
          </span>
          <span>
            {Object.keys(version.content_manifest || {}).length -
              Object.keys(previous.content_manifest || {}).length >=
            0
              ? "+"
              : ""}
            {Object.keys(version.content_manifest || {}).length -
              Object.keys(previous.content_manifest || {}).length}{" "}
            manifest entries
          </span>
        </div>
      )}
    </section>
  );
}

function ComparativePresentation({
  context,
  engagementId,
  version,
}: EngagementProps & { version: AccountsVersion }) {
  const [presentation, setPresentation] = useState<AccountsPresentation | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPresentation(
        (await api.accountsPresentation(context, engagementId, version.id))
          .item,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId, version.id]);
  useEffect(() => {
    load();
  }, [load]);
  if (loading)
    return (
      <div className="comparative-readiness" role="status">
        Checking comparative presentation…
      </div>
    );
  if (error)
    return (
      <MessageBar intent="warning">
        <MessageBarBody>
          Comparative presentation is unavailable. {error}
        </MessageBarBody>
        <Button appearance="transparent" onClick={load}>
          Retry
        </Button>
      </MessageBar>
    );
  if (!presentation) return null;
  return (
    <section
      className="comparative-readiness"
      aria-labelledby={`comparatives-${version.id}`}
    >
      <header>
        <div>
          <h4 id={`comparatives-${version.id}`}>Comparative presentation</h4>
          <p>
            Current and prior-period values are pinned to explicit accounts
            versions.
          </p>
        </div>
        <Badge
          appearance="outline"
          color={
            presentation.readiness.comparativeComplete ? "success" : "warning"
          }
        >
          {presentation.readiness.comparativeComplete
            ? "Complete"
            : "Action required"}
        </Badge>
      </header>
      <dl>
        <div>
          <dt>Current period</dt>
          <dd>
            {presentation.currentPeriod.start} to{" "}
            {presentation.currentPeriod.end}
          </dd>
          <small>Accounts version {presentation.accountsVersionId}</small>
        </div>
        <div>
          <dt>Prior period</dt>
          <dd>
            {presentation.comparativePeriod
              ? `${presentation.comparativePeriod.start} to ${presentation.comparativePeriod.end}`
              : "Not configured"}
          </dd>
          <small>
            {presentation.comparativePeriod
              ? `Accounts version ${presentation.comparativePeriod.accountsVersionId}`
              : "Generate with a comparative source"}
          </small>
        </div>
      </dl>
      {presentation.readiness.blocks.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>
            {presentation.readiness.blocks.join(" · ")}
          </MessageBarBody>
        </MessageBar>
      )}
      {presentation.statements.map((statement) => (
        <div className="comparative-statement" key={statement.statementCode}>
          <h5>{statement.title}</h5>
          <Table
            size="small"
            aria-label={`${statement.title} comparative movements`}
          >
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Line</TableHeaderCell>
                <TableHeaderCell>Current</TableHeaderCell>
                <TableHeaderCell>Prior</TableHeaderCell>
                <TableHeaderCell>Movement</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statement.lines.map((line) => {
                const current = Number(line.current || 0),
                  prior =
                    line.comparative == null ? null : Number(line.comparative);
                return (
                  <TableRow key={line.code}>
                    <TableCell>{line.caption}</TableCell>
                    <TableCell>
                      {current.toLocaleString("en-GB", {
                        style: "currency",
                        currency: "GBP",
                      })}
                    </TableCell>
                    <TableCell>
                      {prior == null
                        ? "—"
                        : prior.toLocaleString("en-GB", {
                            style: "currency",
                            currency: "GBP",
                          })}
                    </TableCell>
                    <TableCell>
                      {prior == null
                        ? "—"
                        : (current - prior).toLocaleString("en-GB", {
                            style: "currency",
                            currency: "GBP",
                            signDisplay: "always",
                          })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </section>
  );
}

function AccountsVersions({
  context,
  engagementId,
  framework,
}: EngagementProps & Pick<Props, "framework">) {
  const [items, setItems] = useState<AccountsVersion[]>([]);
  const [packs, setPacks] = useState<ReportingPack[]>([]);
  const [packCode, setPackCode] = useState("");
  const [comparativeId, setComparativeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [versions, applicablePacks] = await Promise.all([
        api.accountsVersions(context, engagementId),
        api.reportingPacks(context, engagementId),
      ]);
      setItems(versions.items);
      setPacks(applicablePacks.items);
      setPackCode((current) =>
        applicablePacks.items.some((pack) => pack.pack_code === current)
          ? current
          : applicablePacks.items[0]?.pack_code || "",
      );
      setComparativeId((current) =>
        versions.items.some((version) => version.id === current)
          ? current
          : versions.items[1]?.id || "",
      );
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
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={load} />;
  const nextStatus: Partial<Record<AccountsVersion["status"], string>> = {
    DRAFT: "REVIEWED",
    REVIEWED: "APPROVED",
    APPROVED: "FINAL",
  };
  const selectedPack = packs.find((pack) => pack.pack_code === packCode);
  return (
    <section className="panel production-panel">
      <Head
        title="Accounts versions"
        body="Generated accounts, provenance, artefacts and sign-offs by version."
      >
        <div className="pack-actions">
          <Field
            className="pack-field"
            label="Reporting pack"
            hint={
              !selectedPack
                ? framework === "FRS_101"
                  ? "FRS 101 does not currently have a repository baseline."
                  : "No pack matches this framework, sector and reporting period."
                : undefined
            }
          >
            <Select
              id="reporting-pack"
              value={packCode}
              onChange={(event) => setPackCode(event.target.value)}
              disabled={!packs.length}
            >
              {packs.length ? (
                packs.map((pack) => (
                  <option
                    key={`${pack.pack_code}-${pack.version_no}`}
                    value={pack.pack_code}
                  >
                    {pack.title} · v{pack.version_no}
                  </option>
                ))
              ) : (
                <option value="">No applicable pack</option>
              )}
            </Select>
          </Field>
          <Field className="pack-field" label="Comparative source">
            <Select
              value={comparativeId}
              onChange={(event) => setComparativeId(event.target.value)}
            >
              <option value="">No comparative period</option>
              {items.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.version} · {pretty(version.status)}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            className="pack-generate-action"
            appearance="primary"
            disabled={busy === "generate" || !selectedPack}
            onClick={() =>
              selectedPack &&
              act("generate", () =>
                api.generateAccountsVersion(
                  context,
                  engagementId,
                  selectedPack.pack_code,
                  selectedPack.version_no,
                  comparativeId || undefined,
                ),
              )
            }
          >
            {busy === "generate" ? "Generating…" : "Generate version"}
          </Button>
        </div>
      </Head>
      {selectedPack && (
        <MessageBar
          intent={
            selectedPack.certification_status === "CERTIFIED"
              ? "success"
              : "warning"
          }
          layout="multiline"
        >
          <MessageBarBody>
            <MessageBarTitle>{selectedPack.certification_label}</MessageBarTitle>
            {selectedPack.provenance_label} · Effective from{" "}
            {selectedPack.effective_from}
            {selectedPack.effective_to
              ? ` to ${selectedPack.effective_to}`
              : ""}
          </MessageBarBody>
        </MessageBar>
      )}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {!items.length ? (
        <Blank
          title="No accounts versions"
          body="Generate the first version after the trial balance and disclosures are ready."
        />
      ) : (
        <Accordion multiple collapsible className="accounts-version-list">
          {items.map((item, index) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionHeader>
                <span className="accounts-version-summary">
                  <b>
                    Version {item.version} · {pretty(item.status)}
                  </b>
                  <small>
                    Generated {when(item.generated_at)} by {item.generated_by}
                  </small>
                  <Badge
                    appearance="outline"
                    color={item.frozen_at ? "informative" : "warning"}
                  >
                    {item.frozen_at ? "Frozen" : "Mutable draft"}
                  </Badge>
                </span>
              </AccordionHeader>
              <AccordionPanel>
                <dl>
                  <div>
                    <dt>Framework pack</dt>
                    <dd>{item.framework_pack_id}</dd>
                  </div>
                  <div>
                    <dt>Source snapshot</dt>
                    <dd>{item.trial_balance_id ? "Pinned" : "Not pinned"}</dd>
                  </div>
                  <div>
                    <dt>Content integrity</dt>
                    <dd>{item.content_hash ? "Verified" : "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Manifest entries</dt>
                    <dd>{Object.keys(item.content_manifest || {}).length}</dd>
                  </div>
                </dl>
                <AccountsReviewDetail
                  version={item}
                  previous={items[index + 1]}
                />
                <ComparativePresentation
                  context={context}
                  engagementId={engagementId}
                  version={item}
                />
                <EvidenceBundleControl
                  context={context}
                  engagementId={engagementId}
                  version={item}
                />
                <AccountsHtmlArtefact
                  context={context}
                  engagementId={engagementId}
                  version={item}
                />
                <AccountsPdfArtefact
                  context={context}
                  engagementId={engagementId}
                  version={item}
                />
                {item.signoffs?.length ? (
                  <ul className="signoff-list">
                    {item.signoffs.map((signoff) => (
                      <li key={signoff.id}>
                        <b>{pretty(signoff.signoff_type)}</b>
                        <span>
                          {signoff.signed_by} · {when(signoff.signed_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No sign-offs recorded.</p>
                )}
                <footer>
                  {(
                    [
                      "PREPARED",
                      "REVIEWED",
                      "CLIENT_APPROVED",
                      "PARTNER_APPROVED",
                      "FILING_AUTHORISED",
                    ] as const
                  ).map((type) => (
                    <Button
                      key={type}
                      appearance="secondary"
                      disabled={busy === item.id}
                      onClick={() =>
                        act(item.id, () =>
                          api.signoffAccountsVersion(
                            context,
                            engagementId,
                            item.id,
                            item.version,
                            type,
                          ),
                        )
                      }
                    >
                      {pretty(type)}
                    </Button>
                  ))}
                  {nextStatus[item.status] && (
                    <Button
                      appearance="primary"
                      disabled={busy === item.id}
                      onClick={() =>
                        act(item.id, () =>
                          api.transitionAccountsVersion(
                            context,
                            engagementId,
                            item.id,
                            nextStatus[item.status]!,
                          ),
                        )
                      }
                    >
                      {item.status === "REVIEWED"
                        ? "Approve & freeze"
                        : `Move to ${pretty(nextStatus[item.status]!)}`}
                    </Button>
                  )}
                </footer>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}

function EvidenceBundleControl({
  context,
  engagementId,
  version,
}: EngagementProps & { version: AccountsVersion }) {
  const [capability, setCapability] = useState<EvidenceBundleCapability | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCapability(
        (await api.evidenceBundleCapability(context, engagementId, version.id))
          .capability,
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId, version.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await api.evidenceBundleBlob(
        context,
        engagementId,
        version.id,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `accounts-version-${version.version}-evidence.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="evidence-bundle" role="status">
        Checking release evidence…
      </div>
    );
  if (!capability)
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          {error || "Release evidence is unavailable."}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={load}>
            Retry
          </Button>
        </MessageBarActions>
      </MessageBar>
    );
  return (
    <section
      className="evidence-bundle"
      aria-labelledby={`evidence-${version.id}`}
    >
      <header>
        <div>
          <h4 id={`evidence-${version.id}`}>Release evidence bundle</h4>
          <p>
            {capability.dependencies.referencedObjectCount} source objects ·{" "}
            {capability.auditEventCount} audit events · format{" "}
            {capability.formatVersion}
          </p>
        </div>
        <Badge
          appearance="outline"
          color={capability.available ? "success" : "warning"}
        >
          {capability.available ? "Available" : "Blocked"}
        </Badge>
      </header>
      <div className="evidence-bundle-grid">
        <span>
          <b>{capability.dependencies.complete ? "Complete" : "Incomplete"}</b>
          Dependencies
        </span>
        <span>
          <b>
            {capability.signoffs.active}/{capability.signoffs.total}
          </b>
          Active sign-offs
        </span>
        <span>
          <b>{capability.artefacts.pdf.generated ? "Ready" : "Missing"}</b>PDF
          accounts
        </span>
        <span>
          <b>{capability.artefacts.html.generated ? "Ready" : "Missing"}</b>HTML
          accounts
        </span>
      </div>
      {capability.dependencies.missing.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Missing:{" "}
            {capability.dependencies.missing
              .map((item) => `${pretty(item.kind)} ${item.dependency_id}`)
              .join(", ")}
          </MessageBarBody>
        </MessageBar>
      )}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <footer>
        <span>
          Includes the manifest, readiness summary, sign-offs, audit trail and
          generated outputs.
        </span>
        <Button
          appearance="secondary"
          size="small"
          disabled={!capability.available || busy}
          onClick={download}
        >
          {busy ? "Preparing download…" : "Download evidence ZIP"}
        </Button>
      </footer>
    </section>
  );
}

function AccountsHtmlArtefact({
  context,
  engagementId,
  version,
}: EngagementProps & { version: AccountsVersion }) {
  const [capabilities, setCapabilities] = useState<ArtefactCapabilities | null>(
    null,
  );
  const [artefact, setArtefact] = useState<HtmlArtefact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "view" | "download" | "">("");
  const [error, setError] = useState("");
  const basePath = `/v1/engagements/${encodeURIComponent(engagementId)}/accounts-versions/${encodeURIComponent(version.id)}/artefacts/html`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCapabilities(
        (
          await api.accountsArtefactCapabilities(
            context,
            engagementId,
            version.id,
          )
        ).capabilities,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId, version.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy("generate");
    setError("");
    try {
      const result = await api.generateAccountsHtml(
        context,
        engagementId,
        version.id,
      );
      setArtefact(result.item);
      setCapabilities((current) =>
        current
          ? { ...current, html: { ...current.html, generated: true } }
          : current,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  async function openArtefact(download: boolean) {
    setBusy(download ? "download" : "view");
    setError("");
    try {
      const path = download
        ? artefact?.downloadPath || `${basePath}?download=1`
        : artefact?.viewPath || basePath;
      const blob = await api.accountsHtmlBlob(context, path);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.rel = "noopener noreferrer";
      if (download) link.download = `accounts-version-${version.version}.html`;
      else link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  if (loading)
    return (
      <Spinner
        className="artefact-loading"
        label="Checking HTML output…"
        size="tiny"
      />
    );
  if (!capabilities)
    return (
      <MessageBar className="artefact-feedback" intent="error">
        <MessageBarBody>
          {error || "Output capabilities are unavailable."}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={load}>
            Retry
          </Button>
        </MessageBarActions>
      </MessageBar>
    );
  const generated = capabilities.html.generated || Boolean(artefact);
  return (
    <section
      className="artefact-control"
      aria-labelledby={`html-output-${version.id}`}
    >
      <div>
        <b id={`html-output-${version.id}`}>HTML accounts</b>
        <span>
          {generated
            ? artefact
              ? `${(artefact.byteSize / 1024).toFixed(1)} KB · ${artefact.rendererVersion}`
              : "Generated output is ready"
            : "Secure browser-ready accounts output"}
        </span>
      </div>
      {error && (
        <MessageBar className="artefact-inline-feedback" intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div className="artefact-actions">
        {!generated ? (
          <Button
            appearance="secondary"
            disabled={Boolean(busy) || version.status === "SUPERSEDED"}
            onClick={generate}
          >
            {busy === "generate" ? "Generating…" : "Generate HTML"}
          </Button>
        ) : (
          <>
            <Button
              appearance="secondary"
              disabled={Boolean(busy)}
              onClick={() => openArtefact(false)}
            >
              {busy === "view" ? "Opening…" : "View"}
            </Button>
            <Button
              appearance="secondary"
              disabled={Boolean(busy)}
              onClick={() => openArtefact(true)}
            >
              {busy === "download" ? "Downloading…" : "Download"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function AccountsPdfArtefact({
  context,
  engagementId,
  version,
}: EngagementProps & { version: AccountsVersion }) {
  const [capability, setCapability] = useState<
    ArtefactCapabilities["pdf"] | null
  >(null);
  const [artefact, setArtefact] = useState<PdfArtefact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "view" | "download" | "">("");
  const [error, setError] = useState("");
  const basePath = `/v1/engagements/${encodeURIComponent(engagementId)}/accounts-versions/${encodeURIComponent(version.id)}/artefacts/pdf`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCapability(
        (
          await api.accountsArtefactCapabilities(
            context,
            engagementId,
            version.id,
          )
        ).capabilities.pdf,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId, version.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy("generate");
    setError("");
    try {
      const result = await api.generateAccountsPdf(
        context,
        engagementId,
        version.id,
      );
      setArtefact(result.item);
      setCapability((current) =>
        current
          ? {
              ...current,
              available: true,
              generated: true,
              rendererVersion: result.item.rendererVersion,
            }
          : current,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  async function openPdf(download: boolean) {
    setBusy(download ? "download" : "view");
    setError("");
    try {
      const path = download
        ? artefact?.downloadPath || `${basePath}?download=1`
        : artefact?.viewPath || basePath;
      const blob = await api.accountsPdfBlob(context, path);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.rel = "noopener noreferrer";
      if (download) link.download = `accounts-version-${version.version}.pdf`;
      else link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  if (loading)
    return (
      <Spinner
        className="artefact-loading"
        label="Checking PDF output…"
        size="tiny"
      />
    );
  if (!capability)
    return (
      <MessageBar className="artefact-feedback" intent="error">
        <MessageBarBody>
          {error || "PDF capability is unavailable."}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={load}>
            Retry
          </Button>
        </MessageBarActions>
      </MessageBar>
    );
  if (!capability.available)
    return (
      <MessageBar className="artefact-feedback" intent="warning">
        <MessageBarBody>
          <MessageBarTitle>PDF accounts</MessageBarTitle>
          {capability.message ||
            "PDF generation is not available for this version."}
        </MessageBarBody>
      </MessageBar>
    );
  const generated = capability.generated || Boolean(artefact);
  return (
    <section
      className="artefact-control"
      aria-labelledby={`pdf-output-${version.id}`}
    >
      <div>
        <b id={`pdf-output-${version.id}`}>PDF accounts</b>
        <span>
          {generated
            ? artefact
              ? `${(artefact.byteSize / 1024).toFixed(1)} KB · ${artefact.rendererVersion}`
              : `Generated output is ready${capability.rendererVersion ? ` · ${capability.rendererVersion}` : ""}`
            : `Native paginated accounts output${capability.rendererVersion ? ` · ${capability.rendererVersion}` : ""}`}
        </span>
      </div>
      {error && (
        <MessageBar className="artefact-inline-feedback" intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div className="artefact-actions">
        {!generated ? (
          <Button
            appearance="secondary"
            disabled={Boolean(busy) || version.status === "SUPERSEDED"}
            onClick={generate}
          >
            {busy === "generate" ? "Generating…" : "Generate PDF"}
          </Button>
        ) : (
          <>
            <Button
              appearance="secondary"
              disabled={Boolean(busy)}
              onClick={() => openPdf(false)}
            >
              {busy === "view" ? "Opening…" : "View PDF"}
            </Button>
            <Button
              appearance="secondary"
              disabled={Boolean(busy)}
              onClick={() => openPdf(true)}
            >
              {busy === "download" ? "Downloading…" : "Download PDF"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function filingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "SIGNOFFS_REQUIRED")
      return "A current Filing authorised sign-off is required before preparing the regulator payload.";
    if (error.code === "ACCOUNTS_NOT_FINAL")
      return "Only FINAL accounts can be prepared for filing.";
    if (error.code === "FORBIDDEN")
      return "Your workspace role cannot prepare or update filing evidence. Ask a partner or filer.";
  }
  return errorText(error);
}

export function eligibleFilingVersions(
  versions: AccountsVersion[],
): AccountsVersion[] {
  return versions.filter(
    (version) =>
      version.status === "FINAL" &&
      version.signoffs?.some(
        (signoff) =>
          signoff.signoff_type === "FILING_AUTHORISED" &&
          !signoff.invalidated_at,
      ),
  );
}

export function filingActions(
  status: FilingAttempt["status"],
): ("SUBMITTED" | "FAILED" | "WITHDRAWN")[] {
  if (status === "PREPARED") return ["SUBMITTED", "FAILED", "WITHDRAWN"];
  if (status === "SUBMITTED") return ["FAILED", "WITHDRAWN"];
  return [];
}

const evidenceMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "application/xml",
  "application/zip",
  "image/jpeg",
  "image/png",
  "message/rfc822",
  "text/csv",
  "text/html",
  "text/plain",
  "text/xml",
]);
export function validateRegulatorEvidence(
  file: Pick<File, "name" | "size" | "type"> | null,
  regulatorReference: string,
): string {
  if (!file) return "Choose the regulator response evidence file.";
  if (file.size < 1) return "The evidence file is empty.";
  if (file.size > 10 * 1024 * 1024)
    return "The evidence file must be 10 MB or smaller.";
  if (!evidenceMimeTypes.has(file.type.toLowerCase()))
    return "Use JSON, PDF, XML, ZIP, JPEG, PNG, email, CSV, HTML or plain text evidence.";
  if (regulatorReference.length > 255)
    return "The regulator reference must be 255 characters or fewer.";
  if (/[\x00-\x1f\x7f]/.test(regulatorReference))
    return "The regulator reference contains unsupported control characters.";
  return "";
}

function FilingEvidence({
  context,
  engagementId,
  onEngagementChanged,
}: EngagementProps & Pick<Props, "onEngagementChanged">) {
  const [items, setItems] = useState<FilingAttempt[]>([]);
  const [versions, setVersions] = useState<AccountsVersion[]>([]);
  const [accountsVersionId, setAccountsVersionId] = useState("");
  const [regulator, setRegulator] = useState("COMPANIES_HOUSE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [attempts, accounts] = await Promise.all([
        api.filingAttempts(context, engagementId),
        api.accountsVersions(context, engagementId),
      ]);
      setItems(attempts.items);
      setVersions(accounts.items);
      const eligible = eligibleFilingVersions(accounts.items);
      setAccountsVersionId((current) =>
        eligible.some((version) => version.id === current)
          ? current
          : eligible[0]?.id || "",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [context, engagementId]);
  useEffect(() => {
    load();
  }, [load]);
  const eligible = eligibleFilingVersions(versions);
  const unsignedFinal = versions.filter(
    (version) =>
      version.status === "FINAL" &&
      !version.signoffs?.some(
        (signoff) =>
          signoff.signoff_type === "FILING_AUTHORISED" &&
          !signoff.invalidated_at,
      ),
  ).length;

  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (!accountsVersionId) return;
    setBusy("prepare");
    setActionError("");
    try {
      await api.createFilingAttempt(
        context,
        engagementId,
        accountsVersionId,
        regulator,
      );
      await load();
    } catch (e) {
      setActionError(filingError(e));
    } finally {
      setBusy("");
    }
  }

  async function transition(
    item: FilingAttempt,
    status: "SUBMITTED" | "FAILED" | "WITHDRAWN",
  ) {
    setBusy(item.id);
    setActionError("");
    try {
      await api.updateFilingAttempt(context, engagementId, item.id, status);
      await load();
    } catch (e) {
      setActionError(filingError(e));
    } finally {
      setBusy("");
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={load} />;
  return (
    <section className="panel production-panel filing-panel">
      <Head
        title="Regulator filing record"
        body="Prepare manual filing payloads and retain evidence received from external portals. This page does not contact a regulator or retrieve a regulator decision."
      >
        <Button appearance="secondary" size="small" onClick={load}>
          Refresh
        </Button>
      </Head>
      <form className="filing-prepare" onSubmit={prepare}>
        <fieldset>
          <legend>Prepare a filing record</legend>
        <Field
          label="Final accounts version"
          hint={
            !eligible.length
              ? unsignedFinal
                ? `${unsignedFinal} FINAL version${unsignedFinal === 1 ? " is" : "s are"} missing an active Filing authorised sign-off.`
                : "Move an accounts version to FINAL and record its Filing authorised sign-off first."
              : undefined
          }
          required
        >
          <Select
            value={accountsVersionId}
            onChange={(event) => setAccountsVersionId(event.target.value)}
            disabled={!eligible.length}
            required
          >
            {eligible.length ? (
              eligible.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.version} · {version.framework_pack_id}
                </option>
              ))
            ) : (
              <option value="">No filing-authorised FINAL accounts</option>
            )}
          </Select>
        </Field>
        <Field label="Regulator" required>
          <Select
            value={regulator}
            onChange={(event) => setRegulator(event.target.value)}
          >
            {["COMPANIES_HOUSE", "HMRC", "CCEW", "OSCR", "CCNI", "DFE"].map(
              (value) => (
                <option key={value} value={value}>
                  {pretty(value)}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Button
          appearance="primary"
          type="submit"
          disabled={!accountsVersionId || busy === "prepare"}
          disabledFocusable={!accountsVersionId && busy !== "prepare"}
        >
          {busy === "prepare" ? "Preparing…" : "Prepare filing payload"}
        </Button>
        </fieldset>
      </form>
      {actionError && (
        <MessageBar className="filing-message" intent="error">
          <MessageBarBody>{actionError}</MessageBarBody>
        </MessageBar>
      )}
      {!items.length ? (
        <Blank
          title="No filing evidence"
          body="Prepare a payload from filing-authorised FINAL accounts to begin the manual evidence workflow."
        />
      ) : (
        <section className="filing-register" aria-labelledby="filing-register-heading">
          <header>
            <h3 id="filing-register-heading">Filing attempts</h3>
            <p>Submission status, payload provenance and regulator response evidence.</p>
          </header>
        <div className="filing-table-wrap">
          <Table aria-label="Filing evidence attempts" size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Attempt</TableHeaderCell>
                <TableHeaderCell>Accounts</TableHeaderCell>
                <TableHeaderCell>Evidence dates</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell>
                      <div className="filing-attempt">
                        <b>{pretty(item.regulator)}</b>
                        <span>Attempt {item.attempt_no}</span>
                        {item.regulator_reference && (
                          <span className="mono">
                            {item.regulator_reference}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="filing-attempt">
                        <span className="filing-value">
                          {item.accounts_version ?? item.accounts_version_id}
                        </span>
                        <span>
                          {item.responded_at
                            ? "Response evidence recorded"
                            : "No response evidence"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <dl className="filing-dates">
                        <div>
                          <dt>Prepared</dt>
                          <dd>{when(item.created_at)}</dd>
                        </div>
                        <div>
                          <dt>Submitted</dt>
                          <dd>{when(item.submitted_at)}</dd>
                        </div>
                        <div>
                          <dt>Decision</dt>
                          <dd>{when(item.responded_at)}</dd>
                        </div>
                      </dl>
                    </TableCell>
                    <TableCell>
                      <Badge
                        appearance="outline"
                        color={
                          item.status === "ACCEPTED"
                            ? "success"
                            : ["REJECTED", "FAILED"].includes(item.status)
                              ? "danger"
                              : "informative"
                        }
                      >
                        {pretty(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {filingActions(item.status).length > 0 ? (
                        <div className="filing-actions">
                          {item.status === "PREPARED" && (
                            <ConfirmAction
                              label="Record submission"
                              title="Record external submission?"
                              body="Confirm that this payload was submitted through the regulator's external portal. Ledgerly records evidence only and does not contact the regulator."
                              confirmLabel="Record submission"
                              appearance="primary"
                              disabled={busy === item.id}
                              onConfirm={() => transition(item, "SUBMITTED")}
                            />
                          )}
                          <ConfirmAction
                            label="Mark failed"
                            title="Mark filing attempt as failed?"
                            body="This records an unsuccessful external filing attempt. This terminal status cannot be reversed."
                            confirmLabel="Mark failed"
                            appearance="secondary"
                            disabled={busy === item.id}
                            onConfirm={() => transition(item, "FAILED")}
                          />
                          <ConfirmAction
                            label="Withdraw"
                            title="Withdraw filing attempt?"
                            body="This records that the external filing attempt was withdrawn. This terminal status cannot be reversed."
                            confirmLabel="Withdraw"
                            appearance="secondary"
                            disabled={busy === item.id}
                            onConfirm={() => transition(item, "WITHDRAWN")}
                          />
                        </div>
                      ) : (
                        <span className="filing-locked">No further action</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {item.status === "SUBMITTED" && (
                    <TableRow className="filing-decision-row">
                      <TableCell colSpan={5}>
                        <FilingDecisionForm
                          context={context}
                          engagementId={engagementId}
                          attempt={item}
                          onRecorded={async () => {
                            await Promise.all([
                              load(),
                              Promise.resolve(onEngagementChanged()),
                            ]);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {["ACCEPTED", "REJECTED"].includes(item.status) && (
                    <TableRow className="filing-decision-row">
                      <TableCell colSpan={5}>
                        <MessageBar intent="success">
                          <MessageBarBody>
                            Regulator response evidence is recorded. This
                            terminal response cannot be changed here.
                          </MessageBarBody>
                        </MessageBar>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        </section>
      )}
    </section>
  );
}

function FilingDecisionForm({
  context,
  engagementId,
  attempt,
  onRecorded,
}: EngagementProps & {
  attempt: FilingAttempt;
  onRecorded: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"ACCEPTED" | "REJECTED">("ACCEPTED");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  async function record(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateRegulatorEvidence(file, reference);
    if (validation) {
      setError(validation);
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmRecord() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await api.uploadFilingEvidence(
        context,
        engagementId,
        attempt.id,
        file,
        status,
        reference,
      );
      setFile(null);
      setReference("");
      if (inputRef.current) inputRef.current.value = "";
      setConfirmOpen(false);
      await onRecorded();
    } catch (e) {
      setError(filingError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
    <form className="decision-form" onSubmit={record}>
      <fieldset disabled={busy}>
        <legend>Record externally received regulator decision</legend>
        <Field label="Decision" required>
          <Select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "ACCEPTED" | "REJECTED")
            }
          >
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </Field>
        <Field
          label="Regulator reference"
          hint="Optional · maximum 255 characters"
        >
          <Input
            value={reference}
            maxLength={255}
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
        <Field className="decision-file" label="Response evidence" required>
          <input
            ref={inputRef}
            hidden
            type="file"
            required
            accept=".json,.pdf,.xml,.zip,.jpg,.jpeg,.png,.eml,.csv,.html,.txt,application/json,application/pdf,application/xml,application/zip,image/jpeg,image/png,message/rfc822,text/csv,text/html,text/plain,text/xml"
            onChange={(event) => {
              const next = event.target.files?.[0] || null;
              setFile(next);
              setError(validateRegulatorEvidence(next, reference));
            }}
          />
          <div className="decision-file-picker">
            <Button type="button" onClick={() => inputRef.current?.click()}>
              Choose evidence file
            </Button>
            <span title={file?.name}>{file?.name || "No file selected"}</span>
          </div>
          <span
            id={`filing-evidence-reason-${attempt.id}`}
            className="decision-file-hint"
          >
            {file
              ? `${(file.size / 1024).toFixed(1)} KB selected`
              : "Choose a response evidence file (maximum 10 MB; PDF, XML, ZIP, image, email or text)."}
          </span>
        </Field>
        <Button
          appearance="primary"
          type="submit"
          disabled={!file || busy}
          disabledFocusable={!file && !busy}
          aria-describedby={
            !file ? `filing-evidence-reason-${attempt.id}` : undefined
          }
        >
          {busy ? "Recording evidence…" : "Record decision evidence"}
        </Button>
      </fieldset>
      {busy && (
        <div className="upload-progress" role="status" aria-live="polite">
          <progress aria-label="Uploading response evidence" />
          <span>Uploading evidence and recording the regulator decision…</span>
        </div>
      )}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
    </form>
    <ConfirmDialog
      open={confirmOpen}
      title={`Record ${pretty(status)} decision?`}
      body="This records an externally received regulator response. The evidence file will be retained, the decision is terminal, and Ledgerly will not contact the regulator."
      confirmLabel="Record decision"
      busy={busy}
      onCancel={() => setConfirmOpen(false)}
      onConfirm={confirmRecord}
    />
    </>
  );
}
