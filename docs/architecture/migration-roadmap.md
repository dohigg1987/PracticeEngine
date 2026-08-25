# Incremental migration roadmap

No phase is a big-bang rewrite. Each phase keeps a compatibility adapter and a demonstrated rollback path until its consumers and data are verified.

## Phase 0 — Preservation and controls

- **Reuse:** green `c423879` product, Git history, current CI/release guards, tests and runbooks.
- **New:** preservation refs, architecture/design documentation, Codex instruction hierarchy, architecture verification framework.
- **Risk:** documentation drifting from code or implying enforcement that does not exist.
- **Dependencies:** none.
- **Tests:** existing full product gate plus documentation/dependency checks.
- **Rollback:** discard the platform branch; baseline tag/branch remain immutable references.
- **Done:** this foundation task is reviewed with no product/schema/deployment changes.

## Phase 1 — Platform kernel

- **Reuse:** Neon Auth, tenant/membership/invitations, RLS, audit/outbox, notification, R2, lifecycle/retention.
- **New:** explicit identity, tenancy, authorization, audit, files, settings and notification contracts with adapters.
- **Risk:** bypassing current RLS or breaking auth/session/file access.
- **Dependencies:** Phase 0 ownership map.
- **Tests:** tenant isolation, permission denial, audit atomicity, file authorization/hash, adapter parity.
- **Rollback:** route consumers back to existing services; no table removal.
- **Done:** current Ledgerly behaviour passes unchanged through stable Platform interfaces.

## Phase 2 — Commercial/licensing and entitlement kernel

- **Reuse:** tenant identity, audit and settings foundations.
- **New:** product/module/feature catalogue, packages, subscriptions, trials, entitlements, limits and overrides.
- **Risk:** incorrectly disabling paid/legacy tenants or confusing permission with entitlement.
- **Dependencies:** Platform authorization/audit contracts; commercial policy decisions.
- **Tests:** effective-date/override precedence, tenant isolation, permission-versus-entitlement matrix, grandfathering and audit.
- **Rollback:** feature enforcement in observe-only mode, then per-feature kill switch; preserve decisions for diagnosis.
- **Done:** server-side feature-key decisions work without package-name conditionals; no billing-provider lock-in.

## Phase 3 — Canonical Practice Management client master

- **Reuse:** `organisation`, permanent profile, officers, advisers, contacts, archive lifecycle and portal identities.
- **New:** canonical client aggregate contract, relationship model and compatibility mapping.
- **Risk:** duplicate clients, identifier drift, cross-tenant relationship leaks.
- **Dependencies:** Platform identity/authorization/audit and data migration plan.
- **Tests:** RLS, duplicate detection, dual-read parity, archive lifecycle, portal scoping.
- **Rollback:** existing `organisation` APIs remain authoritative behind the adapter.
- **Done:** new modules consume the canonical Practice client service; Ledgerly IDs and functionality remain compatible.

## Phase 4 — Services and engagement model

- **Reuse:** existing accounts engagements and engagement membership.
- **New:** service catalogue, service activation, generic engagement/job relationship and Ledgerly linkage.
- **Risk:** widening current `engagement` semantics or losing framework/period invariants.
- **Dependencies:** canonical client master and entitlements.
- **Tests:** service lifecycle, client/tenant scope, Ledgerly link uniqueness, period/framework compatibility.
- **Rollback:** keep current Ledgerly engagement as system of record until parity is proven.
- **Done:** Ledgerly engagement references a Practice-owned service engagement/job without behavioural regression.

## Phase 5 — Work management, jobs, tasks, workflow and deadlines

- **Reuse:** `workflow_task`, review-point behaviour, assignments and due dates.
- **New:** generic jobs, recurring schedules, deadlines, capacity and workflow definitions.
- **Risk:** duplicate task completion, lost assignee/deadline state, incorrect cross-module transitions.
- **Dependencies:** services/engagements, identity/permissions, notifications.
- **Tests:** recurrence/idempotency, assignment authorization, deadline calculation, audit, Ledgerly adapter parity.
- **Rollback:** dual-write behind a flag with reconciliation; existing Ledgerly tasks remain readable/actionable.
- **Done:** Practice work is canonical while Ledgerly-specific review evidence remains correctly linked.

## Phase 6 — Ledgerly shared-capability integration

- **Reuse:** all current Ledgerly accounting/reporting/evidence features.
- **New:** adapters to shared client, identity, tenancy, audit, permissions, files, settings and entitlements.
- **Risk:** accounting evidence or output provenance regression.
- **Dependencies:** Phases 1-5 and accounting-specialist acceptance.
- **Tests:** full Ledgerly gate, evidence hashes, FINAL/FILED immutability, RLS, entitlement and rollback journeys.
- **Rollback:** capability-by-capability adapter flags; retain old columns/services until acceptance.
- **Done:** Ledgerly no longer duplicates shared masters but preserves all specialist behaviour.

## Phase 7 — CRM, onboarding and QuoteBench integration

- **Reuse:** clients, contacts, portal invitations, services and jobs.
- **New:** CRM pipeline/communications and proposal contract/events for QuoteBench.
- **Risk:** consent/privacy errors, duplicate prospects/clients, proposal-to-service mismatch.
- **Dependencies:** Practice client/service core, events and entitlements.
- **Tests:** conversion idempotency, authorization, consent, proposal acceptance -> service/job creation.
- **Rollback:** integration off switch and replayable events; CRM records remain independent projections.
- **Done:** accepted proposals create authorized Practice work through contracts, not direct table writes.

## Phase 8 — Portal, documents and communications

- **Reuse:** client portal identity/access, document request/response/review, R2 and notifications.
- **New:** common document metadata/version/access service, communication preferences and module-neutral portal shell.
- **Risk:** document disclosure, stale access, retention conflicts.
- **Dependencies:** Platform files, Practice relationships and identity.
- **Tests:** object authorization, hash/version integrity, revocation, retention/legal hold, portal isolation.
- **Rollback:** domain adapters continue to resolve current link tables and storage objects.
- **Done:** modules use common secure file/portal contracts with no public storage keys.

## Phase 9 — Clarity IE and additional specialist modules

- **Reuse:** Platform, Commercial and Practice contracts plus the Ledgerly integration pattern.
- **New:** module-specific bounded contexts, features and adapters.
- **Risk:** cross-module coupling and accidental shared-table fields.
- **Dependencies:** stable contracts, entitlement catalogue and event governance.
- **Tests:** module boundary checks, tenant/permission/entitlement matrix, contract tests and module-specific acceptance.
- **Rollback:** independently disable a module and its consumers without corrupting shared records.
- **Done:** each module is separately licensable and deployable within the modular monolith without duplicating shared capabilities.
