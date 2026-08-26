# QuoteBench integration
QuoteBench is a specialist module registered in the commercial catalogue. Stable entitlement keys are `quotebench.enabled`, `quotebench.proposals`, `quotebench.pricing`, `quotebench.templates` and `quotebench.esign`; application code never branches on package names.

PracticeEngine owns the prospect/client, contacts, opportunity, proposed service intent, conversion, engagement and operational work. QuoteBench owns proposal composition, pricing, versions, documents and the commercial acceptance artefact. `quotebench_proposal_reference` therefore stores only the stable proposal/version identifier, lifecycle status and opaque acceptance artefact reference.

Proposal linking returns bounded shared context: tenant, opportunity, prospect or client reference, responsible member, currency and selected Practice service references. It does not expose database credentials or copy proposal content. QuoteBench events are accepted at the authenticated integration application boundary for created, sent, viewed, accepted, declined and expired states. `specialist_event_receipt` makes every event idempotent.

Acceptance invokes the conversion transaction described in [prospect-client-conversion.md](prospect-client-conversion.md). Declined and expired proposal events update only the proposal reference; they do not silently delete a relationship or create operational records. Cross-module communication uses the application boundary and normalized outbox facts, not direct QuoteBench writes into Practice tables.
