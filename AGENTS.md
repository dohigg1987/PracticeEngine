# Repository instructions

## Read first

- Current implementation: `docs/architecture/current-state.md`
- Target and ownership: `docs/architecture/target-platform.md`, `domain-boundaries.md`
- Ledgerly preservation: `docs/architecture/ledgerly-integration.md`
- Migration plan: `docs/architecture/migration-roadmap.md`
- Design rules: `docs/design/DESIGN-CONSTITUTION.md`, `ANTI-PATTERNS.md`
- Verification truth: `docs/architecture/verification.md`

## Architecture map

Platform Core owns identity, tenancy, authorization, audit, files, notifications and common settings. Commercial Core owns products, features, subscriptions and entitlements. Practice Management owns the client and operational work relationship. Ledgerly owns accounting and accounts production. Dependencies point toward lower shared layers through explicit contracts.

## Preservation and change control

- Preserve tag `pre-platform-refactor-baseline` and branch `legacy/current-product-baseline`; never rewrite their history.
- Develop platform work on `platform/modular-practice-foundation` or a focused branch from it, never directly on production `main`.
- Do not delete, rename or relocate working Ledgerly code for architectural aesthetics.
- Use additive, reversible changes and compatibility adapters. No destructive data consolidation without later explicit approval and verified rollback.
- Do not deploy or mutate production data unless the specific task authorizes it and repository release guards pass.

## Mandatory engineering rules

- Enforce tenant isolation, authorization and entitlements server-side. UI gating is not security.
- Separate functional permission from commercial entitlement; never branch on package names.
- Every auditable mutation appends an immutable audit event; use the transactional outbox for external effects requiring reliable publication.
- Keep module data ownership explicit; no uncontrolled shared-table fields or direct writes into another module.
- Fluent UI React v9 is authoritative for application UI; use public components, semantic tokens, accessible keyboard/focus behaviour and established patterns.
- Preserve existing conventions and add focused tests for changed behaviour.

## Completion

Run `npm run verify:architecture` for documentation/boundary changes and the smallest relevant gates while iterating. Before handoff run `npm run verify` unless the task explicitly limits scope; report any pre-existing failure separately. Completion requires code, tests, docs, tenant/auth/audit/entitlement implications and rollback to be accounted for.
