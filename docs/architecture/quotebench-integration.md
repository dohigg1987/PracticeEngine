# QuoteBench integration
QuoteBench is a specialist module registered in the commercial catalogue. Stable entitlement keys are `quotebench.enabled`, `quotebench.proposals`, `quotebench.pricing`, `quotebench.templates` and `quotebench.esign`; application code never branches on package names.

PracticeEngine owns the prospect/client, contacts, opportunity, proposed service intent, conversion, engagement and operational work. QuoteBench owns proposal composition, pricing, versions, documents and the commercial acceptance artefact. `quotebench_proposal_reference` therefore stores only the stable proposal/version identifier, lifecycle status and opaque acceptance artefact reference.

Proposal linking returns bounded shared context: tenant, opportunity, prospect or client reference, responsible member, currency and selected Practice service references. It does not expose database credentials or copy proposal content. QuoteBench events are accepted at the authenticated integration application boundary for created, sent, viewed, accepted, declined and expired states. `specialist_event_receipt` makes every event idempotent.

Acceptance invokes the conversion transaction described in [prospect-client-conversion.md](prospect-client-conversion.md). Declined and expired proposal events update only the proposal reference; they do not silently delete a relationship or create operational records. Cross-module communication uses the application boundary and normalized outbox facts, not direct QuoteBench writes into Practice tables.

## Accepted commercial context

PM-007 may project bounded accepted proposal facts into `work_commercial_context`: agreed fee/value, currency, billing model, frequency, Practice service reference and effective period. The record retains `proposal_reference_id`, source type and accepted source version. A QuoteBench-sourced context cannot exist without the tenant-scoped proposal reference.

This is an immutable-provenance management reference, not a copy of QuoteBench's pricing engine or proposal document. Superseding commercial terms close the prior effective period and add a new context; they do not silently rewrite historical time valuations or reports. Missing accepted value remains unavailable, never zero. PracticeEngine does not infer billing or recovery from proposal acceptance; externally supplied recovery evidence is a separate fact.
