import React, { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarActions,
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
import { AddRegular, ArrowLeftRegular, EditRegular } from "@fluentui/react-icons";
import {
  api,
  ApiContext,
  OrganisationPermanentFile,
  PermanentFileAddress,
  PermanentFileAdviser,
  PermanentFileOfficer,
} from "./api";
import { personDisplayName, statutoryLabel } from "./format";
import { statusBadgeProps } from "./statusBadge";

const officerTypes = ["DIRECTOR", "TRUSTEE", "COMPANY_SECRETARY", "PARTNER", "DESIGNATED_MEMBER", "LLP_MEMBER", "OTHER"] as const;
const adviserTypes = ["ACCOUNTANT", "AUDITOR", "INDEPENDENT_EXAMINER", "BANKER", "SOLICITOR", "TAX_ADVISER", "INSURER", "INVESTMENT_MANAGER", "OTHER"] as const;
const legalForms = ["PRIVATE_LIMITED_COMPANY", "PUBLIC_LIMITED_COMPANY", "LIMITED_LIABILITY_PARTNERSHIP", "LIMITED_PARTNERSHIP", "GENERAL_PARTNERSHIP", "SOLE_TRADER", "CHARITABLE_COMPANY", "CHARITABLE_INCORPORATED_ORGANISATION", "CHARITABLE_TRUST", "COMMUNITY_INTEREST_COMPANY", "OTHER"] as const;
const nameStyles = ["FULL_NAME", "TITLE_AND_SURNAME", "INITIALS_AND_SURNAME", "FULL_NAME_WITH_HONOURS"] as const;
const professionalBodies = ["", "ICAEW", "ACCA", "ICAS", "CAI", "AAT", "ACIE", "OTHER"] as const;
const reportStyles = ["GENERIC", "ICAEW", "ACCA", "ICAS", "CAI", "CUSTOM_APPROVED"] as const;

type RecordEditor = { kind: "officer" | "adviser"; id?: string } | null;

type Props = {
  context: ApiContext;
  organisationId: string;
  onBack: () => void;
  onOpenEngagement: (engagementId: string) => void;
};

const label = statutoryLabel;
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
const address = (value?: PermanentFileAddress | null) =>
  value
    ? [
        value.line1,
        value.line2,
        value.locality,
        value.region,
        value.postalCode,
        value.countryCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "—";

export default function ClientPermanentFile({
  context,
  organisationId,
  onBack,
  onOpenEngagement,
}: Props) {
  const [item, setItem] = useState<OrganisationPermanentFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [recordEditor, setRecordEditor] = useState<RecordEditor>(null);
  const [recordForm, setRecordForm] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItem(
        (await api.organisationPermanentFile(context, organisationId)).item,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The permanent file could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [context, organisationId]);
  useEffect(() => {
    load();
  }, [load]);

  function beginEdit(current: OrganisationPermanentFile) {
    const organisation = current.organisation;
    const office = organisation.registeredOfficeAddress;
    setProfile({
      legalForm: organisation.legalForm || "OTHER",
      officerNameStyle: organisation.officerNameStyle || "FULL_NAME",
      tradingName: organisation.tradingName || "",
      companyRegistrationNumber: organisation.companyRegistrationNumber || "",
      charityRegistrationNumber: organisation.charityRegistrationNumber || "",
      registeredOfficeLine1: office?.line1 || "",
      registeredOfficeLine2: office?.line2 || "",
      registeredOfficeLocality: office?.locality || "",
      registeredOfficeRegion: office?.region || "",
      registeredOfficePostalCode: office?.postalCode || "",
      registeredOfficeCountryCode: office?.countryCode || "GB",
      accountingReferenceDay: String(organisation.accountingReferenceDay || ""),
      accountingReferenceMonth: String(organisation.accountingReferenceMonth || ""),
      principalActivity: organisation.principalActivity || "",
      website: organisation.website || "",
      telephone: organisation.telephone || "",
      notes: organisation.notes || "",
    });
    setActionError("");
    setEditing(true);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await api.updateOrganisationPermanentFile(context, organisationId, {
        ...profile,
        accountingReferenceDay: profile.accountingReferenceDay ? Number(profile.accountingReferenceDay) : null,
        accountingReferenceMonth: profile.accountingReferenceMonth ? Number(profile.accountingReferenceMonth) : null,
      });
      setEditing(false);
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The client record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function editOfficer(officer?: PermanentFileOfficer) {
    setRecordForm({
      officerType: officer?.officerType || "DIRECTOR",
      displayName: officer?.displayName || "",
      title: officer?.title || "",
      givenNames: officer?.givenNames || "",
      middleNames: officer?.middleNames || "",
      familyName: officer?.familyName || "",
      suffixHonours: officer?.suffixHonours || "",
      appointedOn: officer?.appointedOn?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      resignedOn: officer?.resignedOn?.slice(0, 10) || "",
      occupation: officer?.occupation || "",
      email: officer?.email || "",
      telephone: officer?.telephone || "",
    });
    setActionError("");
    setRecordEditor({ kind: "officer", id: officer?.id });
  }

  function editAdviser(adviser?: PermanentFileAdviser) {
    setRecordForm({
      adviserType: adviser?.adviserType || "ACCOUNTANT",
      firmName: adviser?.firmName || "",
      contactName: adviser?.contactName || "",
      contactQualifications: adviser?.contactQualifications || "",
      professionalBody: adviser?.professionalBody || "",
      reportStyle: adviser?.reportStyle || "GENERIC",
      activeFrom: adviser?.activeFrom?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      activeTo: adviser?.activeTo?.slice(0, 10) || "",
      email: adviser?.email || "",
      telephone: adviser?.telephone || "",
      reference: adviser?.reference || "",
      addressLine1: adviser?.address?.line1 || "",
      addressLocality: adviser?.address?.locality || "",
      addressPostalCode: adviser?.address?.postalCode || "",
      addressCountryCode: adviser?.address?.countryCode || "GB",
    });
    setActionError("");
    setRecordEditor({ kind: "adviser", id: adviser?.id });
  }

  async function saveRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!recordEditor) return;
    setSaving(true);
    setActionError("");
    try {
      const body = Object.fromEntries(Object.entries(recordForm).map(([key, value]) => [key, value.trim() || null]));
      if (recordEditor.kind === "officer") {
        if (recordEditor.id) await api.updatePermanentFileOfficer(context, organisationId, recordEditor.id, body);
        else await api.createPermanentFileOfficer(context, organisationId, body);
      } else if (recordEditor.id) await api.updatePermanentFileAdviser(context, organisationId, recordEditor.id, body);
      else await api.createPermanentFileAdviser(context, organisationId, body);
      setRecordEditor(null);
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The permanent-file record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const updateRecord = (key: string, value: string) => setRecordForm((current) => ({ ...current, [key]: value }));

  if (loading)
    return (
      <Skeleton
        className="permanent-file-loading"
        aria-label="Loading client permanent file"
      >
        <SkeletonItem size={24} />
        <SkeletonItem />
        <SkeletonItem />
        <SkeletonItem />
      </Skeleton>
    );
  if (error || !item)
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          {error || "Permanent file unavailable."}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={load}>
            Retry
          </Button>
          <Button appearance="transparent" onClick={onBack}>
            Back to clients
          </Button>
        </MessageBarActions>
      </MessageBar>
    );

  const organisation = item.organisation;
  return (
    <section className="permanent-file">
      <header className="permanent-file-head">
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={onBack}
        >
          Clients
        </Button>
        <div>
          <h1>{organisation.legalName}</h1>
          <p>
            {label(organisation.legalForm)} · {label(organisation.jurisdiction)}
          </p>
        </div>
        <Button appearance="primary" icon={<EditRegular />} onClick={() => beginEdit(item)}>
          Edit client details
        </Button>
      </header>

      {actionError && <MessageBar intent="error"><MessageBarBody>{actionError}</MessageBarBody></MessageBar>}
      {editing && (
        <form className="permanent-file-edit" onSubmit={saveProfile}>
          <header><h2>Edit legal and registered details</h2><div><Button type="button" onClick={() => setEditing(false)}>Cancel</Button><Button appearance="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></div></header>
          <Field label="Legal form" required><Select value={profile.legalForm} onChange={(_, d) => setProfile({ ...profile, legalForm: d.value })}>{legalForms.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
          <Field label="Officer name format" required><Select value={profile.officerNameStyle} onChange={(_, d) => setProfile({ ...profile, officerNameStyle: d.value })}>{nameStyles.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
          <Field label="Trading name"><Input value={profile.tradingName} onChange={(_, d) => setProfile({ ...profile, tradingName: d.value })} /></Field>
          <Field label="Company number"><Input value={profile.companyRegistrationNumber} onChange={(_, d) => setProfile({ ...profile, companyRegistrationNumber: d.value })} /></Field>
          <Field label="Charity number"><Input value={profile.charityRegistrationNumber} onChange={(_, d) => setProfile({ ...profile, charityRegistrationNumber: d.value })} /></Field>
          <Field label="Telephone"><Input value={profile.telephone} onChange={(_, d) => setProfile({ ...profile, telephone: d.value })} /></Field>
          <Field label="Website"><Input value={profile.website} onChange={(_, d) => setProfile({ ...profile, website: d.value })} /></Field>
          <div className="permanent-file-period"><Field label="Reference day"><Input type="number" min={1} max={31} value={profile.accountingReferenceDay} onChange={(_, d) => setProfile({ ...profile, accountingReferenceDay: d.value })} /></Field><Field label="Month"><Input type="number" min={1} max={12} value={profile.accountingReferenceMonth} onChange={(_, d) => setProfile({ ...profile, accountingReferenceMonth: d.value })} /></Field></div>
          <Field className="wide" label="Registered office address line 1"><Input value={profile.registeredOfficeLine1} onChange={(_, d) => setProfile({ ...profile, registeredOfficeLine1: d.value })} /></Field>
          <Field label="Address line 2"><Input value={profile.registeredOfficeLine2} onChange={(_, d) => setProfile({ ...profile, registeredOfficeLine2: d.value })} /></Field>
          <Field label="Town or city"><Input value={profile.registeredOfficeLocality} onChange={(_, d) => setProfile({ ...profile, registeredOfficeLocality: d.value })} /></Field>
          <Field label="Region"><Input value={profile.registeredOfficeRegion} onChange={(_, d) => setProfile({ ...profile, registeredOfficeRegion: d.value })} /></Field>
          <Field label="Postcode"><Input value={profile.registeredOfficePostalCode} onChange={(_, d) => setProfile({ ...profile, registeredOfficePostalCode: d.value })} /></Field>
          <Field label="Country code"><Input maxLength={2} value={profile.registeredOfficeCountryCode} onChange={(_, d) => setProfile({ ...profile, registeredOfficeCountryCode: d.value.toUpperCase() })} /></Field>
          <Field className="wide" label="Principal activity"><Textarea rows={3} value={profile.principalActivity} onChange={(_, d) => setProfile({ ...profile, principalActivity: d.value })} /></Field>
          <Field className="wide" label="Permanent-file notes"><Textarea rows={4} value={profile.notes} onChange={(_, d) => setProfile({ ...profile, notes: d.value })} /></Field>
        </form>
      )}

      <section
        className="permanent-file-section"
        aria-labelledby="legal-details-heading"
      >
        <header>
          <h2 id="legal-details-heading">Legal and registered details</h2>
        </header>
        <dl className="permanent-file-register">
          <div>
            <dt>Trading name</dt>
            <dd>{organisation.tradingName || "—"}</dd>
          </div>
          <div>
            <dt>Company number</dt>
            <dd>{organisation.companyRegistrationNumber || "—"}</dd>
          </div>
          <div>
            <dt>Charity number</dt>
            <dd>{organisation.charityRegistrationNumber || "—"}</dd>
          </div>
          <div>
            <dt>Registered office</dt>
            <dd>{address(organisation.registeredOfficeAddress)}</dd>
          </div>
          <div>
            <dt>Principal activity</dt>
            <dd>{organisation.principalActivity || "—"}</dd>
          </div>
          <div>
            <dt>Telephone</dt>
            <dd>{organisation.telephone || "—"}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              {organisation.website ? (
                <Link href={organisation.website} target="_blank">
                  {organisation.website}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Accounting reference</dt>
            <dd>
              {organisation.accountingReferenceDay &&
              organisation.accountingReferenceMonth
                ? `${organisation.accountingReferenceDay}/${organisation.accountingReferenceMonth}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Permanent-file notes</dt>
            <dd>{organisation.notes || "—"}</dd>
          </div>
        </dl>
      </section>

      <section
        className="permanent-file-section"
        aria-labelledby="officers-heading"
      >
        <header>
          <h2 id="officers-heading">Officers</h2>
          <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => editOfficer()}>
            Add officer
          </Button>
        </header>
        {recordEditor?.kind === "officer" && (
          <form className="permanent-file-record-form" onSubmit={saveRecord}>
            <header>
              <h3>{recordEditor.id ? "Edit officer" : "Add officer"}</h3>
              <div><Button type="button" onClick={() => setRecordEditor(null)}>Cancel</Button><Button appearance="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save officer"}</Button></div>
            </header>
            <Field label="Capacity" required><Select value={recordForm.officerType} onChange={(_, d) => updateRecord("officerType", d.value)}>{officerTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
            <Field label="Full name" required><Input value={recordForm.displayName} onChange={(_, d) => updateRecord("displayName", d.value)} /></Field>
            <Field label="Title"><Input value={recordForm.title} onChange={(_, d) => updateRecord("title", d.value)} /></Field>
            <Field label="Given names"><Input value={recordForm.givenNames} onChange={(_, d) => updateRecord("givenNames", d.value)} /></Field>
            <Field label="Middle names or initials"><Input value={recordForm.middleNames} onChange={(_, d) => updateRecord("middleNames", d.value)} /></Field>
            <Field label="Family name"><Input value={recordForm.familyName} onChange={(_, d) => updateRecord("familyName", d.value)} /></Field>
            <Field label="Honours or qualifications"><Input value={recordForm.suffixHonours} onChange={(_, d) => updateRecord("suffixHonours", d.value)} /></Field>
            <Field label="Appointed" required><Input type="date" value={recordForm.appointedOn} onChange={(_, d) => updateRecord("appointedOn", d.value)} /></Field>
            <Field label="Resigned"><Input type="date" value={recordForm.resignedOn} onChange={(_, d) => updateRecord("resignedOn", d.value)} /></Field>
            <Field label="Occupation"><Input value={recordForm.occupation} onChange={(_, d) => updateRecord("occupation", d.value)} /></Field>
            <Field label="Email"><Input type="email" value={recordForm.email} onChange={(_, d) => updateRecord("email", d.value)} /></Field>
            <Field label="Telephone"><Input value={recordForm.telephone} onChange={(_, d) => updateRecord("telephone", d.value)} /></Field>
          </form>
        )}
        <div className="permanent-file-table">
          <Table size="small" aria-label="Client officers">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Capacity</TableHeaderCell>
                <TableHeaderCell>Appointed</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.officers.map((officer) => (
                <TableRow key={officer.id}>
                  <TableCell>
                    <b>{personDisplayName(officer, organisation.officerNameStyle)}</b>
                  </TableCell>
                  <TableCell>{label(officer.officerType)}</TableCell>
                  <TableCell>{date(officer.appointedOn)}</TableCell>
                  <TableCell>
                    {officer.resignedOn
                      ? `Resigned ${date(officer.resignedOn)}`
                      : "Current"}
                  </TableCell>
                  <TableCell><Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => editOfficer(officer)}>Edit</Button></TableCell>
                </TableRow>
              ))}
              {!item.officers.length && (
                <TableRow>
                  <TableCell colSpan={5}>No officers recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section
        className="permanent-file-section"
        aria-labelledby="advisers-heading"
      >
        <header>
          <h2 id="advisers-heading">Professional advisers</h2>
          <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => editAdviser()}>
            Add adviser
          </Button>
        </header>
        {recordEditor?.kind === "adviser" && (
          <form className="permanent-file-record-form" onSubmit={saveRecord}>
            <header>
              <h3>{recordEditor.id ? "Edit adviser" : "Add adviser"}</h3>
              <div><Button type="button" onClick={() => setRecordEditor(null)}>Cancel</Button><Button appearance="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save adviser"}</Button></div>
            </header>
            <Field label="Service" required><Select value={recordForm.adviserType} onChange={(_, d) => updateRecord("adviserType", d.value)}>{adviserTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
            <Field label="Firm" required><Input value={recordForm.firmName} onChange={(_, d) => updateRecord("firmName", d.value)} /></Field>
            <Field label="Contact"><Input value={recordForm.contactName} onChange={(_, d) => updateRecord("contactName", d.value)} /></Field>
            <Field label="Qualifications or honours"><Input value={recordForm.contactQualifications} onChange={(_, d) => updateRecord("contactQualifications", d.value)} /></Field>
            <Field label="Professional body"><Select value={recordForm.professionalBody} onChange={(_, d) => updateRecord("professionalBody", d.value)}>{professionalBodies.map((value) => <option key={value || "NONE"} value={value}>{value || "Not specified"}</option>)}</Select></Field>
            <Field label="Assurance report style"><Select value={recordForm.reportStyle} onChange={(_, d) => updateRecord("reportStyle", d.value)}>{reportStyles.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
            <Field label="Active from" required><Input type="date" value={recordForm.activeFrom} onChange={(_, d) => updateRecord("activeFrom", d.value)} /></Field>
            <Field label="Ended"><Input type="date" value={recordForm.activeTo} onChange={(_, d) => updateRecord("activeTo", d.value)} /></Field>
            <Field label="Email"><Input type="email" value={recordForm.email} onChange={(_, d) => updateRecord("email", d.value)} /></Field>
            <Field label="Telephone"><Input value={recordForm.telephone} onChange={(_, d) => updateRecord("telephone", d.value)} /></Field>
            <Field label="Reference"><Input value={recordForm.reference} onChange={(_, d) => updateRecord("reference", d.value)} /></Field>
            <Field className="wide" label="Address"><Input value={recordForm.addressLine1} onChange={(_, d) => updateRecord("addressLine1", d.value)} /></Field>
            <Field label="Town or city"><Input value={recordForm.addressLocality} onChange={(_, d) => updateRecord("addressLocality", d.value)} /></Field>
            <Field label="Postcode"><Input value={recordForm.addressPostalCode} onChange={(_, d) => updateRecord("addressPostalCode", d.value)} /></Field>
            <Field label="Country code"><Input maxLength={2} value={recordForm.addressCountryCode} onChange={(_, d) => updateRecord("addressCountryCode", d.value.toUpperCase())} /></Field>
          </form>
        )}
        <div className="permanent-file-table">
          <Table size="small" aria-label="Professional advisers">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Service</TableHeaderCell>
                <TableHeaderCell>Firm</TableHeaderCell>
                <TableHeaderCell>Contact</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.advisers.map((adviser) => (
                <TableRow key={adviser.id}>
                  <TableCell>{label(adviser.adviserType)}</TableCell>
                  <TableCell>
                    <b>{adviser.firmName}</b>
                    <small>{address(adviser.address)}</small>
                  </TableCell>
                  <TableCell>
                    {adviser.contactName || "—"}
                    {adviser.contactQualifications ? `, ${adviser.contactQualifications}` : ""}
                    <small>{adviser.email || adviser.telephone}</small>
                  </TableCell>
                  <TableCell>{label(adviser.status)}{adviser.professionalBody ? <small>{adviser.professionalBody} · {label(adviser.reportStyle)}</small> : null}</TableCell>
                  <TableCell><Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => editAdviser(adviser)}>Edit</Button></TableCell>
                </TableRow>
              ))}
              {!item.advisers.length && (
                <TableRow>
                  <TableCell colSpan={5}>No advisers recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section
        className="permanent-file-section"
        aria-labelledby="engagement-history-heading"
      >
        <header>
          <h2 id="engagement-history-heading">Engagement history</h2>
        </header>
        <div className="permanent-file-table">
          <Table size="small" aria-label="Client engagement history">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Period</TableHeaderCell>
                <TableHeaderCell>Framework</TableHeaderCell>
                <TableHeaderCell>Sector</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.engagements.map((engagement) => (
                <TableRow key={engagement.id}>
                  <TableCell>
                    <Link
                      as="button"
                      className="permanent-file-link"
                      onClick={() => onOpenEngagement(engagement.id)}
                    >
                      {date(engagement.periodStart)} –{" "}
                      {date(engagement.periodEnd)}
                    </Link>
                  </TableCell>
                  <TableCell>{label(engagement.framework)}</TableCell>
                  <TableCell>
                    {label(engagement.sectorProfile || "NONE")}
                  </TableCell>
                  <TableCell>
                    <Badge {...statusBadgeProps(engagement.status)}>
                      {label(engagement.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!item.engagements.length && (
                <TableRow>
                  <TableCell colSpan={4}>No engagements recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </section>
  );
}
