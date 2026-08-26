# Current-state architecture

## Baseline

This inventory describes commit `c4238790774c59c036248d1c96a07169c48f135b`, preserved by the annotated tag `pre-platform-refactor-baseline` and branch `legacy/current-product-baseline`. The repository is an npm-workspaces modular monolith with 214 tracked files.

The product is a working, multi-tenant UK accounts-production application. The target platform must preserve it and introduce contracts around it incrementally; the current implementation is not a disposable prototype.

## Repository and runtime map

| Area | Current implementation |
|---|---|
| Web application | React/Vite SPA in `apps/web`; `src/main.tsx` installs `FluentProvider`, `ErrorBoundary`, and `App`. `App.tsx` owns the shell and state-based navigation; `EngagementProduction.tsx`, `CommercialWorkspace.tsx`, and `ClientPermanentFile.tsx` contain major surfaces. |
| API | Cloudflare Worker in `apps/api`; `src/index.ts` is the main route dispatcher. Auth, commercial, permanent-file, output, workflow, evidence, and publisher responsibilities have supporting modules. |
| Accounting domain | Framework-independent accounting types and behaviours in `packages/domain`. Despite its generic name, most of this package is Ledgerly accounting domain code. |
| Reporting and rules | Deterministic statement construction and packs in `packages/reporting`; compliance catalogue and rules evaluation in `packages/rules`. |
| Data | PostgreSQL migrations `0001`-`0028` and operational verification runbooks in `packages/database`. Neon is reached through Cloudflare Hyperdrive. |
| Identity | Neon Auth in the browser and JWT/JWKS verification in `apps/api/src/auth.ts`. A Pages Function proxies the production auth path. |
| Files | Cloudflare R2 stores source imports, attachments, outputs, and evidence; domain tables retain storage keys, hashes, provenance, and access relationships. |
| Delivery | Cloudflare Pages hosts the web app; Workers hosts the API; release and lockstep guards are in `scripts/`. |
| Tests | Node tests for domain/API, Vitest for web contracts, Playwright for workflows, accessibility, forced colours, responsive layout, and output verification. |

The SPA does not currently expose a URL route per application surface. `App.tsx` switches workspace pages (`engagement`, `clients`, `team`, `integrations`, `inbox`, `settings`) and engagement views (`overview`, source data, mapping, journals, reconciliations, tasks, review points, working papers, disclosures, accounts, versions, filing, portal, history) through state.

## Capability inventory

The classification describes the target treatment, not a deletion decision.

| Capability | What it does and where | Principal data/API/UI | Dependencies | Classification |
|---|---|---|---|---|
| Identity and authentication | Neon Auth session handling and bearer-token verification. | `apps/web/src/auth.ts`; `apps/api/src/auth.ts`; `/v1/me/tenants`. | Neon Auth, JWT/JWKS. | **RETAIN AND EXTEND** into a shared identity contract. |
| Tenants, onboarding, team and invitations | Creates/selects workspaces; manages OWNER/ADMIN/MEMBER membership and invitations. | `tenant`, `tenant_member`, `tenant_invitation`, `workspace_onboarding`; migrations `0003`, `0010`, `0014`, `0024`; Team UI in `App.tsx`. | Auth, RLS, audit. | **RETAIN AND EXTEND** as Platform Core. |
| Authorization and tenant isolation | Establishes transaction-local actor/tenant context and enforces extensive Postgres RLS. Engagement membership adds scoped roles. | `0006_authenticated_tenant_rls.sql` and later policies; API authorization helpers. | PostgreSQL roles/settings, Neon identities. | **RETAIN AND EXTEND** with an explicit permission vocabulary; never replace server enforcement with UI checks. |
| Client master | Holds legal entity, permanent profile, officers, advisers, contacts, archive lifecycle, and portal relationships. | `organisation`, `organisation_permanent_profile`, `organisation_officer`, `organisation_professional_adviser`, `client_contact`; `ClientPermanentFile.tsx`; `/v1/organisations`. | Tenant, engagements, portal, files. | **ADAPT** behind a Practice Management client contract while preserving identifiers and compatibility. |
| Engagements | Represents a period-specific accounts-production engagement pinned to framework and sector. | `engagement`, `engagement_member`; `/v1/engagements`; engagement setup in `App.tsx`. | Organisation, reporting packs, all Ledgerly workflows. | **ADAPT**: preserve current Ledgerly semantics, then relate them to generic services/jobs owned by Practice Management. |
| Tasks and review points | Tracks accounts-engagement work, blocking state, assignee/due date, responses and clearance. | `workflow_task`, `review_point`; engagement APIs and `App.tsx` views. | Engagement roles, audit. | **MIGRATE** incrementally behind a Practice Management work contract; preserve existing records and behaviour. |
| Trial-balance import and provenance | Accepts tolerant CSV encodings/headings, stores immutable originals, parses rows, and builds versioned source/imported balances. | `import_batch`, `import_row`, `import_snapshot`, `source_account`, `trial_balance*`; `packages/domain/src/csv-import.ts`; source-data UI/APIs. | R2, accounting domain, audit/outbox. | **RETAIN** as Ledgerly. |
| Canonical mapping | Maps source accounts to canonical reporting accounts using table and assisted model interactions. | `canonical_account`, `canonical_report_line`, `account_mapping`; mapping API/UI. | Trial balance, reporting definitions, audit. | **RETAIN** as Ledgerly; expose only governed contracts to other modules. |
| Journals and adjustments | Creates balanced journals with preparation, approval, posting, and immutable state transitions. | `journal`, `journal_line`; `packages/domain/src/journal.ts`; Journals UI/API. | Trial balance, roles, sign-offs, audit. | **RETAIN** as Ledgerly. |
| Reconciliations | Compares ledger balances to independent values, applies tolerance and review controls. | `reconciliation`; `packages/domain/src/reconciliation.ts`; Reconciliations UI/API. | Engagement, trial balance, roles. | **RETAIN** as Ledgerly. |
| Working papers | Provides governed templates, deployment, versions, risks, assertions, report-line/theme links, attachments and sign-off workflow. | `working_paper*`, `engagement_risk`, template/override/link tables; `apps/api/src/working-paper-*`; `EngagementProduction.tsx`. | Engagement, R2, audit, reporting. | **RETAIN** as Ledgerly; later consume common files, identity and audit contracts. |
| Disclosures and reporting | Scopes disclosures, versions content, evaluates packs/rules, creates deterministic statements and comparative presentation. | `disclosure*`, `reporting_framework_pack*`, `statement_definition*`, `taxonomy_*`, `packages/reporting`, `packages/rules`. | Trial balances, client facts, certification metadata. | **RETAIN** as Ledgerly. |
| Accounts versions and sign-offs | Generates immutable accounts versions, comparative links, preparation/review/client/partner/filing sign-offs and release checks. | `accounts_version*`, `signoff`; accounts-version APIs and UI. | Reporting, working papers, disclosures, audit. | **RETAIN** as Ledgerly. |
| Outputs and filing evidence | Produces authenticated HTML/PDF/DOCX and deterministic evidence ZIPs; records manual portal filing evidence. Direct regulator submission remains unavailable. | Artefact helpers in `apps/api/src`; `filing_attempt`; Filing UI/API. | R2, accounts versions, hashes, audit. | **RETAIN**. Manual filing is an intentional capability boundary, not obsolete code. |
| Audit and domain delivery | Appends hash-chained audit events and transactional outbox records; publishes with bounded delivery history. | `audit_event`, `outbox_event`, `outbox_delivery_attempt`; `packages/domain/src/audit.ts`; publisher. | Every material mutation. | **RETAIN AND EXTEND** as Platform Core infrastructure and contract. |
| Client portal and document requests | Provides scoped client identities/access, invitations, document requests/responses/reviews. | `client_portal_*`, `client_engagement_access`, `client_document_*`; `CommercialWorkspace.tsx` and commercial API. | Client master, engagements, R2, auth. | **RETAIN AND EXTEND** through shared portal/files contracts. |
| Integrations | Defines connectors, connections, sync runs/items/errors; currently emphasises file/CSV workflows. | `connector_definition`, `integration_connection`, `integration_sync_*`; Import Centre. | Client/engagement, audit, secret references. | **ADAPT** into a shared integration contract while retaining Ledgerly adapters. |
| Notifications and inbox | Stores recipient-scoped notifications/read state and delivery attempts. | `notification`; Inbox UI and commercial API. | Audit/outbox, tenant membership. | **RETAIN AND EXTEND** as Platform Core. |
| Settings, lifecycle, export and retention | Supports workspace name/status, export requests, organisation archive, retention policies and legal holds. | `tenant_lifecycle_*`, `tenant_export_request`, `retention_*`, `legal_hold*`, migration `0028`, database runbooks. | Tenant authorization, audit, R2/Postgres operations. | **RETAIN AND EXTEND**; introduce namespaced module settings later. |
| Practice Management | Existing fragments cover client records, team, accounts engagements, tasks/review, inbox, portal and imports. Services, generic jobs, recurring work, deadlines, capacity, CRM and practice reporting are not canonical domains yet. | Current fragments above; no dedicated package or service boundary. | Platform Core, future licensing. | **RETAIN AND EXTEND** existing primitives; add missing capabilities without a big-bang replacement. |
| Products, packages, subscriptions and entitlements | No canonical model or enforcement was found. Existing “commercial” code describes pilot operations rather than product licensing. | No owned schema/API. | Identity, tenant, module registry, billing provider later. | **UNKNOWN, REQUIRES FURTHER ANALYSIS** followed by a new Layer 2 kernel. |
| QuoteBench and Clarity IE | No code, schema, route, import or integration reference was found. | None in this repository. | Future module contracts. | **UNKNOWN, REQUIRES FURTHER ANALYSIS**. |
| Fluent design system | Fluent React v9 provider/components/icons, semantic status helpers, forced-colour stylesheet and UI quality guards are established, alongside remaining baselined CSS debt. | `apps/web/src/main.tsx`, component files, CSS, `scripts/ui-quality-*`, Playwright audits. | `@fluentui/react-components`, Griffel runtime. | **RETAIN AND EXTEND**; improve incrementally, not through unrelated redesign. |

## PM-005 delta

Migration `0033` and `apps/api/src/crm-onboarding.ts` now implement tenant-scoped prospects, opportunities, proposed-service references, QuoteBench proposal references/events, idempotent acceptance conversion and workflow-backed onboarding. `apps/api/src/notification-worker.ts` supplies durable provider-neutral notification consumption. These additions preserve the baseline inventory below and do not move Ledgerly ownership.

## Important overlaps and constraints

- `organisation*`, `client_contact`, portal identity and engagement access describe overlapping slices of a client relationship. Practice Management must establish canonical ownership without replacing IDs before consumers migrate.
- `engagement` and `workflow_task` have generic names but Ledgerly-specific semantics. Names alone must not determine future ownership.
- R2 is shared infrastructure, not yet a shared document domain. Domain link tables, hashes and access rules remain authoritative until a common file service is proven.
- `apps/api/src/index.ts` and `apps/web/src/App.tsx` are large composition roots. They should acquire façades and application-service boundaries incrementally rather than being relocated wholesale.
- `packages/domain` is primarily an accounting domain package. It must not silently become a dumping ground called “Platform Core”.
- There is no current entitlement kernel. Package names must not be introduced as behaviour switches while that kernel is designed.
- Production reporting packs remain governed repository baselines and require accountable accounting review; software tests are not certification.

## Current validation and release commands

- `npm run test:core`
- `npm test --workspace apps/api`
- `npm run check --workspace apps/api`
- `npm run typecheck --workspace apps/web`
- `npm test --workspace apps/web`
- `npm run test:ui-quality --workspace apps/web`
- `npm run test:headers --workspace apps/web`
- `npm run test:e2e --workspace apps/web`
- `npm run verify:pilot`
- `npm run verify:lockstep`
- Guarded releases: `npm run release:check:api`, `release:api`, `release:check:web`, `release:web`.
