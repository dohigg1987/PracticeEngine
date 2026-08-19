# Commercial completion gate

This document defines “100%” for the current build programme. It is a product
acceptance gate, not a claim that repository baseline accounting content has
been independently certified or that third-party regulator credentials exist.

## Controlled commercial pilot — required

Every item below must be implemented, tenant-isolated, covered by automated
contract tests, and exercised in supervised acceptance against non-production
Neon and R2 services.

1. Identity and workspace administration
   - Neon Auth sign-in, onboarding, invitations and role-aware membership.
   - Tenant suspension and export-request controls with immutable audit events.
2. Client and engagement administration
   - Legal entities, accounting periods, framework/sector selection and scoped
     engagement membership.
   - Client contacts receive engagement-scoped portal access rather than broad
     workspace access.
3. Source data
   - Bounded CSV and XLSX trial-balance import, saved import templates,
     deterministic content hashes, mapping and provenance.
   - Connector records store secret references only and expose idempotent sync
     history, item counts and actionable failures.
4. Accounts production
   - Journals, reconciliations, tasks, review points, working papers,
     disclosures, sign-offs and versioned accounts.
   - Current and comparative periods remain explicitly linked and independently
     traceable to their source versions.
5. Client collaboration
   - Document requests, versioned responses/uploads, comments and approval or
     rejection evidence with staff/client actor separation.
6. Outputs and evidence
   - Authenticated HTML/PDF generation and deterministic evidence ZIP download.
   - Release readiness blocks incomplete dependencies and never hides baseline
     or certification status.
7. Filing evidence
   - Filing-authorised FINAL accounts can produce a manual filing package.
   - External responses are recorded atomically and ACCEPTED accounts become
     FILED. The product never claims direct submission when no adapter exists.
8. Delivery operations
   - Transactional outbox publication has locking, bounded retries,
     idempotency, delivery history and a dead-letter state.
   - User notifications have read state and link only to authorised resources.
9. Operational acceptance
   - Health/readiness, correlation IDs, structured logs, security headers,
     production configuration validation, recovery and retention runbooks.
   - Full automated gate plus supervised real-auth, real-Neon and real-R2 UAT.

## Broadly commercial product — required

The pilot requirements above remain mandatory. Commercial completion also
requires:

- a dedicated client portal experience and secure document delivery;
- accounting-connector contracts and at least one genuinely supported provider
  or an explicitly supported file-based adapter;
- workspace administration, lifecycle/export requests and delivery monitoring;
- current/comparative accounts presentation and professional statutory output;
- saved import/mapping templates, bulk-error recovery and auditable sync history;
- notifications and operational handling of failed deliveries;
- deployment on controlled HTTPS origins with monitoring, backup protection and
  an evidenced recovery drill;
- accounting-specialist acceptance of every reporting pack offered to pilot
  users.

## External certification boundary

The following gates cannot be satisfied by software implementation alone and
must never be silently counted as complete:

- independent accounting-specialist approval of statutory content;
- regulator-certified taxonomy/content releases;
- production credentials and contractual approval for regulator submission;
- third-party connector credentials and provider conformance testing;
- approved production hostnames, Cloudflare account access, backup policy and
  completed recovery evidence.

Until those approvals exist, the UI and generated outputs must continue to show
the exact baseline, connector and filing capabilities that are actually active.
