# Domain boundaries

## Mandatory rules

1. A higher architectural layer may consume lower-layer capabilities.
2. A specialist module must not recreate a capability already owned by Platform Core or Practice Management.
3. Modules must not directly manipulate another module's internal implementation without a defined contract.
4. Cross-domain integration uses defined APIs, application services and/or domain events.
5. Data ownership is explicit for every aggregate and table.
6. Shared tables are not an uncontrolled dumping ground for module-specific fields.
7. Every tenant-owned record has an enforceable tenant boundary.
8. Authorization is enforced server-side.
9. Every auditable mutation produces an immutable audit event.
10. Licensing is controlled through entitlements, never package-name conditionals.

## Ownership matrix

| Domain | Owns | May reference | Must not own |
|---|---|---|---|
| Platform Core | Tenant, identity link, membership, permission definitions, audit ledger, file metadata/storage contract, notifications, common settings, flags, partner/brand primitives | Module/resource identifiers through stable references | Accounting, client service delivery, billing-provider-specific workflow |
| Commercial and Licensing | Products, modules, features, packages, subscriptions, entitlements, limits, overrides, trials | Tenant and actor references from Platform | Functional roles/permissions, client records, accounting state |
| Practice Management | Client master, relationships, services, generic engagements/jobs, work/deadlines, capacity, CRM, communications, client requests/portal relationship | Platform identities/files/audit; entitlement decisions | Trial balances, journals, statutory accounts, module-specific working papers |
| Ledgerly | Accounting imports, mappings, ledger/TB, adjustments, reconciliations, accounts-production evidence/reporting/filing | Practice client/job/service IDs; Platform identity/files/audit/settings; entitlements | Independent tenant/team/client master or generic practice work model |
| Future specialist module | Its bounded professional domain | Shared Platform and Practice contracts | Another module's internal tables or duplicate shared masters |

## Contract patterns

- **Synchronous query/command:** use an application-service interface for decisions needed in the current transaction, such as authorization, entitlement or client lookup.
- **Domain event:** publish a fact that has already happened and can be consumed asynchronously. Events are immutable and cannot be used as hidden commands.
- **Compatibility adapter:** map existing Ledgerly routes/tables to a new contract while consumers migrate.
- **Read model:** denormalize across domains only through an owned projection with rebuild/provenance rules; do not grant arbitrary cross-module writes.

## Tenant, authorization and audit boundary

Every command must establish authenticated actor and tenant context, check tenant membership/resource scope, check functional permission, check entitlement when applicable, perform the mutation, append the audit event and enqueue external publication atomically where possible. UI visibility is helpful but never the security boundary.

Global reference data must be explicitly marked global and read-only to tenant runtime roles. Tenant overrides belong in tenant-owned overlay tables rather than adding nullable tenant-specific fields to the global record.

## Current compatibility decisions

- Keep `organisation` as the current client identity anchor until a Practice client contract and migration map exist.
- Keep current accounts `engagement` and `workflow_task` records until Practice service/job/work identifiers can be related without breaking APIs.
- Keep domain-specific R2 link tables; a shared files service should wrap access before metadata consolidation.
- Keep the existing audit/outbox tables as the ledger and delivery foundation; standardize event names and payloads progressively.
- Keep `packages/domain` accounting-focused. New Platform Core code must not be placed there solely because the folder name is generic.
