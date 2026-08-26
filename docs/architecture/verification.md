# Architecture verification

## What is enforced now

- Sequential migration filenames, baseline migration recording and production binding lockstep: `npm run verify:lockstep`.
- Disposable Neon migration execution and database security invariants: `npm run verify:neon-migrations`. It requires an explicitly confirmed non-production Neon owner URL and executes each migration file as one complete PostgreSQL script.
- Domain/API/web type and test gates: existing npm scripts and CI.
- Fluent source-debt ceilings, prohibited native controls/internal selectors and token rules: web UI quality guard.
- Security-header generation and validation.
- Chromium workflow, responsive, accessibility and forced-colour coverage.
- Guarded releases from a clean, exact `main` commit.
- This branch adds `npm run verify:architecture` for required architecture sources, basic forbidden dependency directions, package-name licensing conditionals and the PM-001 tenant/RLS inventory.
- PM-001 API contract tests verify identity/membership separation, tenant-safe foreign keys, permission and entitlement checks, client compatibility, contact relationships, entitlement precedence, mutation audit coverage and explicit audit immutability.
- PM-002 architecture checks inventory every Practice Management tenant table, permission and required architecture source. Focused API/UI tests cover lifecycle transitions, tenant-qualified access, entitlement enforcement, audit/outbox facts, work filtering and the Ledgerly compatibility link.
- PM-004 uses timed development, integration and full-pilot gates. The authoritative command matrix, Playwright isolation rationale and test classifications are in `docs/engineering/verification-strategy.md`.
- PM-005 architecture checks inventory CRM, QuoteBench reference, conversion, onboarding and notification tables; focused contracts cover ownership, idempotency, RLS, authorization, entitlements, audit/outbox and provider-neutral delivery. The UI guard starts at 187 current legacy occurrences and PM-005 lowers the checked-in ceiling in touched responsive navigation/pane styles.
- PM-006 architecture checks require the portal/request/document/messaging/identity/machine-auth sources and inventory migration `0034` tenant tables, forced-RLS membership, staff permissions, portal entitlements and security-definer boundaries. Focused API contracts cover resource-scoped portal authorization, response/document/message idempotency, private R2 delivery controls, audit/outbox facts and QuoteBench signature/replay enforcement.
- PM-007 architecture checks require resource, capacity, time, WIP, economics and portfolio sources and inventory migration `0035` tenant tables, forced RLS, composite tenant foreign keys, restricted grants, permissions and feature keys. Focused source contracts preserve membership/work ownership, effective dating, historical cost snapshots, QuoteBench provenance and unknown-not-zero semantics.
- The authoritative pilot browser stage defaults to two process shards per detected browser. With Edge installed that is four concurrent jobs: Chromium 1/2 and 2/2, Edge 1/2 and 2/2. `PLAYWRIGHT_SHARDS_PER_BROWSER` may override the positive shard count.
- `PLAYWRIGHT_WORKERS` is a total browser-worker budget, default four, divided across jobs. A budget smaller than the number of browser-shard jobs is rejected rather than silently exceeded. Default Windows execution gives each of four jobs one worker; Chromium-only execution gives each of two jobs two workers.
- Every shard has its own two-port Vite pair and artifact root under `apps/web/test-results/pilot/{browser}-{shard}-of-{total}/{test-results,html-report}`. The runner waits for every shard, reports status/duration per job, retains failure evidence, records browser wall-clock plus nested jobs in `VERIFY_TIMING_JSON`, and fails when any shard exits non-zero. Retry-dependent results remain explicit.

## What is not yet enforced

- Production entitlement and RLS behaviour is never inferred from source tests; PM-002 includes a disposable-Neon-branch verification script and records its execution separately from the offline gate.
- The initial permission catalogue exists, but there is not yet a generated route-to-permission policy matrix.
- Audit-event expectation coverage is route/test-specific, not a mutation-wide static guarantee.
- Module boundaries are logical documentation plus a minimal import-direction guard; no package-level platform/practice/module topology exists yet.
- Production readiness does not currently prove the live database migration head; `/ready` only proves connectivity.
- Existing RLS verification and grant runbooks do not yet cover every historical table; PM-006 adds a focused disposable fixture for migration `0034` rather than representing full historical coverage as complete.
- Source-contract checks cannot prove runtime RLS or economic arithmetic. Migration `0035` must also be applied to a fresh disposable Neon branch with two-tenant fixtures covering every new table, cost/economics restrictions and cross-tenant association denial.
- Database rollback relies on Neon branch/PITR procedures; there are no down migrations.

## Canonical commands

- `npm run verify:architecture` — quick architecture documents/import-direction/schema-inventory guard.
- `npm run verify:fast` — development gate without the browser release matrix.
- `npm run verify:integration` — production-shaped build/Worker checks and targeted Practice Chromium smoke.
- `npm run verify:pilot` — authoritative sharded Chromium and detected-Edge release gate.
- `npm run verify` — compatibility interface for the complete verification sequence.

CI runs the quick architecture guard in the non-browser job. Migration safety, tenant isolation, authorization, audit and entitlement enforcement should be strengthened in later focused PRs rather than represented as complete here.

## Next checks to add

1. Schema-head verification in `/ready` and the release preflight.
2. Generate the privilege/RLS inventory from migration metadata instead of maintaining the current explicit controlled list.
3. Contract tests requiring audit/outbox append for every registered command handler.
4. Explicit module manifests and import graph when Platform/Practice packages are created.
5. Generate route-to-permission and permission-to-role decision matrices from the implemented catalogue.
6. Migration fixtures that verify forward apply, cross-tenant denial, compatibility reads, and documented rollback on a disposable Neon branch.
7. Property-based capacity/economic tests over overlapping periods, calendar boundaries and unknown input propagation.
