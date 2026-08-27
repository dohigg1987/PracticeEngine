# Target modular platform

PracticeEngine is the suite identity. Its global shell selects exactly one active application through the application manifest registry; specialist applications never inject primary navigation into global chrome. Canonical UI namespaces are `/practice`, `/ledgerly`, `/quotebench` and the reserved `/clarity-ie`, with shared settings below `/settings`.

## Architectural stance

Build a modular monolith first. Preserve Ledgerly's working vertical slice and introduce explicit ownership, application services, contracts, and domain events around it. Physical deployment may remain a React application, Cloudflare Worker, Neon/Postgres and R2 while logical module boundaries mature.

The dependency direction is `Specialist Modules -> Practice Management -> Commercial and Licensing -> Platform Core` only where a higher layer needs a lower-layer capability. A lower layer never depends on a specialist module.

## Layer 1: Platform Core

Platform Core owns:

- identity and authentication;
- tenants/practices, users and teams;
- roles, permissions and server-side authorization;
- immutable audit/event infrastructure;
- shared files/documents infrastructure;
- notifications;
- common and namespaced settings;
- feature flags;
- partner/reseller relationships;
- shared branding and white-labelling primitives.

Existing Neon Auth, `tenant`, membership/invitation, RLS, audit/outbox, notification, R2, lifecycle and retention capabilities are the starting assets. Platform contracts should wrap them before schema relocation is considered.

## Layer 2: Commercial and Licensing Core

This layer owns:

- products, modules and features;
- packages and package composition;
- subscriptions and trials;
- tenant entitlements and usage limits;
- tenant and feature overrides;
- commercial package configuration.

An entitlement answers “may this tenant use this product capability?” A functional permission answers “may this actor perform this action on this resource?” Both must pass when both apply. Package names are configuration labels, never conditionals in application code.

Suggested initial contracts:

- `EntitlementService.isEnabled(tenantId, featureKey)`;
- `EntitlementService.limitFor(tenantId, limitKey)`;
- `AuthorizationService.assertAllowed(actor, permission, resource)`;
- an auditable entitlement-decision result containing source, effective period and override provenance.

Billing-provider integration is outside the first kernel. The internal product/feature/entitlement model must not depend on one payment vendor.

## Layer 3: Practice Management Core

Practice Management is the operational system of record for the practice-client relationship. It ultimately owns:

- canonical client master, contacts, officers and relationships;
- client groups;
- services and service activation/termination;
- generic engagements and jobs;
- recurring work, tasks, deadlines and workflow;
- assignment, review and approval;
- capacity;
- CRM and communications;
- client requests and portal relationships;
- practice reporting.

The current `organisation` identifier should be preserved as the compatibility anchor while a canonical client aggregate and service/job concepts are introduced. A Ledgerly accounts engagement should progressively reference a Practice Management service engagement/job rather than being renamed or deleted.

## Layer 4: Specialist Modules

### Ledgerly

Ledgerly owns accounting behaviour and evidence:

- source imports and integrations specific to accounting;
- source accounts, canonical accounting model and mappings;
- ledger/trial balance;
- journals and adjustments;
- reconciliations;
- accounts-production working papers and disclosures;
- reporting packs and statutory outputs;
- accounting sign-offs, evidence bundles and filing evidence.

Ledgerly consumes shared identity, tenancy, authorization, audit, entitlements, files, settings and notifications. It consumes Practice Management client, service, engagement/job, task/deadline and portal relationships. It does not create a second client master.

### Future specialist modules

QuoteBench, Clarity IE, tax, payroll and other professional-service applications must register product features and consume shared contracts. No module receives direct write access to another module's internal tables.

## Suggested module topology

The exact folders are deferred until Phase 1, but the logical seams are:

```text
platform/
  identity  tenancy  authorization  audit  files  notifications  settings
commercial/
  catalogue  subscriptions  entitlements  limits
practice/
  clients  services  engagements  jobs  work  crm  portal
modules/
  ledgerly  quotebench  clarity-ie  tax  payroll
```

Existing folders remain in place during scaffolding. New contracts can initially live beside them; compatibility adapters keep current API/UI behaviour working.

## Cross-cutting invariants

- Every tenant-owned record has an enforceable tenant boundary.
- Authorization and entitlement checks occur server-side at application-service boundaries.
- Every auditable mutation appends an immutable audit event in the same unit of work.
- External effects use the transactional outbox where atomic publication matters.
- File access is authorized through metadata relationships; raw storage keys are not public contracts.
- APIs use stable external identifiers and explicit versioning/optimistic concurrency where lost updates matter.
- Fluent UI React v9 is the authoritative application design system.
- Compatibility is retained until consumers and data have migrated and rollback has been demonstrated.
