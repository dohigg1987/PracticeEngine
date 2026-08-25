# Ledgerly preservation and platform integration

## Principle

Ledgerly is the existing specialist accounts-production product and the baseline reference implementation. Preserve working behaviour, identifiers, evidence, audit history, migrations and release paths. Architectural purity is not grounds for a rewrite.

## Capability treatment

| Ledgerly area | Current treatment | Progressive integration path |
|---|---|---|
| Trial-balance import, original files and provenance | **Preserve unchanged** | Consume common file metadata/access once it can preserve hashes, source artefacts and orphan handling. |
| Source accounts, canonical model and mappings | **Preserve unchanged** | Keep Ledgerly ownership; make access entitlement-controlled and publish accounting lifecycle events. |
| Trial balance, journals and adjustments | **Preserve unchanged** | Use common actor/permission/audit contracts through adapters; do not move accounting rules into Practice Management. |
| Reconciliations | **Preserve unchanged** | Relate completion/deadlines to Practice jobs without duplicating reconciliation state. |
| Reporting rules, packs and statutory statements | **Preserve unchanged** | Keep certification/governance metadata explicit; Platform does not own accounting content. |
| Working papers, risks, evidence and attachments | **Expose through shared platform shell** | **Adapt to common authorization, audit and files** while retaining Ledgerly version/evidence tables. |
| Disclosures and accounts versions | **Preserve unchanged** | Consume canonical client facts via Practice contracts; retain deterministic versioning/sign-offs. |
| HTML/PDF/DOCX/evidence bundle | **Preserve unchanged** | Route storage and downloads through common file authorization without exposing R2 keys. |
| Filing evidence | **Preserve unchanged** | Continue truthful manual-portal semantics until a certified adapter exists. |
| Tenant, team and identity | **Adapt to common authorization** | Platform Core owns identity, tenancy, membership, roles and permission evaluation; keep current adapters during migration. |
| Client/legal entity/permanent file | **Adapt to shared client master** | Preserve `organisation` IDs as compatibility references; Practice Management becomes canonical and Ledgerly reads required client facts through a contract. |
| Accounts engagement | **Expose through shared platform shell** | Link current period/framework engagement to Practice service/engagement/job; avoid in-place semantic widening. |
| Tasks and review points | **Adapt to Practice work management** | Preserve existing rows and UI until shared jobs/tasks can mirror and then own operational work. Ledgerly-specific review evidence may remain specialist. |
| Client portal requests/responses | **Adapt to common files and Practice portal relationships** | Keep secure engagement scoping until shared equivalents cover every authorization/evidence case. |
| Settings and template overrides | **Adapt to common settings** | Introduce namespaced settings and maintain current tables through a Ledgerly settings adapter. |
| Notifications | **Adapt to Platform notifications** | Preserve recipient/read state and domain links; standardize dispatch contracts. |
| All user-facing Ledgerly capability | **Make entitlement controlled** | Add feature checks at server application-service boundaries; never key behaviour from package labels. |
| Deep internal refactors | **Later refactor only if justified** | Require measured value, compatibility plan, tests and rollback; do not refactor merely to match folder aesthetics. |

## Compatibility sequence

1. Define shared contracts and identifiers without changing existing Ledgerly tables or routes.
2. Add adapters that read/write the current implementation and produce normalized events.
3. Introduce Practice/client/job relations alongside existing columns, initially nullable and observable.
4. Backfill on a disposable Neon branch with reconciliation reports; do not mutate production in this foundation task.
5. Move consumers one at a time behind the contract, retaining read compatibility and rollback flags.
6. Transfer system-of-record status only after dual-read comparison, authorization/RLS tests and operational acceptance.
7. Remove duplication only in a later, explicitly approved migration after every downstream consumer has moved.

## Non-negotiable accounting safeguards

- Balanced trial balances and journals remain enforced.
- FINAL/FILED immutability and version provenance remain intact.
- Every mapping, journal, sign-off, output and filing mutation remains auditable.
- Tenant and engagement authorization remain server-side and RLS-backed.
- Reporting baseline/certification state remains truthful in UI and evidence.
- Original uploads, output hashes and evidence links remain recoverable.

## Known integration questions

- Define the canonical Practice client aggregate spanning `organisation*`, contacts and portal identities.
- Decide how current accounts `engagement` relates to generic Practice engagement/service/job records.
- Decide which review points remain Ledgerly evidence versus generic Practice tasks.
- Define a common file metadata/access contract that preserves current domain hashes and retention semantics.
- Establish product/module/feature keys and grandfathering rules before enforcing Ledgerly entitlements.
