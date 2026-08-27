# CRM foundation
Practice Management owns the tenant-scoped pre-client relationship. Migration `0033` adds `prospect`, configurable `crm_stage_definition`, `opportunity`, `opportunity_service` and `crm_activity`. Opportunities may belong to a prospect or an explicitly selected existing canonical client. Proposed services reference `practice_service`; no second service catalogue exists.

Contacts remain canonical `contact` records. `prospect_contact_relationship` supplies prospect context and conversion copies relationships into `client_contact_relationship`; it never copies the mutable contact itself. A prospect does not create an `organisation`. Conversion is permitted only through accepted-proposal processing and retains the resulting client reference.

The Worker boundary is `apps/api/src/crm-onboarding.ts`. Reads require `crm.view` and `practice.crm`; mutations use separate prospect/opportunity permissions. The UI provides operational Prospect and Opportunity tables plus conventional detail, service and proposal sections. Every query is tenant qualified; all CRM tables use forced RLS and tenant-safe foreign keys.

Stages are data, seeded with qualification through won/lost defaults, and can be configured without changing application code. The `won` transition is reserved for accepted-proposal conversion. Material creation and stage changes append hash-chained audit evidence and normalized outbox facts.
