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

## What is not yet enforced

- Production entitlement and RLS behaviour is never inferred from source tests; PM-002 includes a disposable-Neon-branch verification script and records its execution separately from the offline gate.
- The initial permission catalogue exists, but there is not yet a generated route-to-permission policy matrix.
- Audit-event expectation coverage is route/test-specific, not a mutation-wide static guarantee.
- Module boundaries are logical documentation plus a minimal import-direction guard; no package-level platform/practice/module topology exists yet.
- Production readiness does not currently prove the live database migration head; `/ready` only proves connectivity.
- Existing RLS verification and grant runbooks do not yet cover every table through migration `0028`.
- Database rollback relies on Neon branch/PITR procedures; there are no down migrations.

## Canonical commands

- `npm run verify:architecture` — quick architecture documents/import-direction guard.
- `npm run verify` — architecture guard followed by the existing complete pilot verification.

CI runs the quick architecture guard in the non-browser job. Migration safety, tenant isolation, authorization, audit and entitlement enforcement should be strengthened in later focused PRs rather than represented as complete here.

## Next checks to add

1. Schema-head verification in `/ready` and the release preflight.
2. Generate the privilege/RLS inventory from migration metadata instead of maintaining the current explicit controlled list.
3. Contract tests requiring audit/outbox append for every registered command handler.
4. Explicit module manifests and import graph when Platform/Practice packages are created.
5. Generate route-to-permission and permission-to-role decision matrices from the implemented catalogue.
6. Migration fixtures that verify forward apply, cross-tenant denial, compatibility reads, and documented rollback on a disposable Neon branch.
