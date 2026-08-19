# Controlled-pilot data retention runbook

## Status and ownership

This is an operational baseline, not legal advice and not an authorization to delete production data. The data controller, legal owner, security owner, and product owner must approve the final schedule before an external pilot. A legal hold, investigation, tax enquiry, contract, regulator request, or other documented obligation always overrides routine deletion.

UK company and charity accounting records are commonly required for at least six years, while UK GDPR requires personal data to be kept no longer than necessary. The pilot therefore uses a conservative seven-year accounting-data baseline, subject to case-specific confirmation.

## Proposed pilot schedule

| Data class | Retention clock | Pilot baseline | End-of-period action |
| --- | --- | --- | --- |
| Engagement accounting spine, imports, trial balance, journals, working papers, disclosures, accounts versions, sign-offs, filings, audit evidence | Later of accounting period end or engagement closure | 7 years | Approved tenant-scoped purge or archival unless a hold applies |
| Reporting and taxonomy governance content | Release withdrawal or supersession | Indefinite while referenced, then 7 years | Preserve provenance and review evidence; governance records remain append-only |
| Tenant, organisation, membership, and operational actor references | Contract termination | Active contract plus 90 days, but retain references required by accounting/audit records | Anonymise unnecessary personal attributes before deleting referential anchors |
| Invitations | Expiry, revocation, or consumption | 30 days after terminal state | Delete token hash and unnecessary invitation data through trusted maintenance only |
| Delivered outbox events | Successful publication | 90 days | Purge only after downstream reconciliation |
| Failed or pending outbox events | Resolution | Until resolved plus 90 days | Never purge unresolved delivery evidence |
| Application logs | Event time | 30 days by default | Delete or aggregate, excluding approved security evidence |
| Security and privileged-operation audit evidence | Event time | 365 days minimum | Review with security owner; longer when linked to accounting evidence or an incident |
| R2 HTML, PDF, filing evidence, and source objects | Same clock as the owning database record | Match parent record | Delete through a reconciled object-cleanup workflow |
| Unreferenced R2 uploads | Detection | 7-day quarantine | Delete only after repeated DB-reference checks |
| Neon Auth identities, sessions, and provider metadata | Account closure or session expiry | Separate approved Auth schedule | Use the supported Neon Auth lifecycle; do not manipulate the managed schema ad hoc |

## Hold and deletion controls

1. Open a signed deletion request containing tenant ID, scope, cutoff time, legal basis, requester, approver, and legal-hold result.
2. Run the read-only inventory query and store counts as evidence. Inventory R2 separately because object state is not fully represented in Postgres.
3. Require independent approval for tenant-wide deletion. The production application role must not receive broad purge privileges.
4. Quiesce affected writes or use a repeatable, idempotent maintenance workflow.
5. Preserve audit evidence and referential integrity. Prefer anonymisation when a record must remain to support accounting evidence.
6. Reconcile R2 and database state. Quarantine candidate objects before irreversible deletion where storage controls allow it.
7. Record before/after counts, object manifests, operator, approver, UTC times, exceptions, and recovery point.
8. Verify tenant isolation and ensure no other tenant IDs were affected.

## Current implementation gaps

- The schema has no legal-hold, retention-until, erasure-request, or purge-job model.
- There is no automated R2 orphan inventory or reconciled object lifecycle job.
- Invitation and outbox retention are not automated and deliberately are not granted to `accounts_app` as broad DELETE capabilities.
- Neon Auth retention and deletion require a separately tested managed-service procedure.
- A representative non-production deletion and point-in-time recovery drill has not yet been evidenced.

Until these gaps are closed, retention execution is a trusted, manually approved maintenance operation. Do not run destructive statements from an application session or from this runbook.

## Authoritative references

- [GOV.UK company and accounting records](https://www.gov.uk/running-a-limited-company/company-and-accounting-records)
- [GOV.UK managing charity finances](https://www.gov.uk/guidance/managing-charity-finances)
- [ICO UK GDPR storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
