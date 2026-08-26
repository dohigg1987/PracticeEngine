# Client onboarding
`onboarding_case` is the controlled bridge between commercial acceptance and operational delivery. It records tenant, client, opportunity/proposal provenance, engagement, owner/team, optional published template and instantiated work item, state and gate completion. `onboarding_case_service` maps accepted service intent to canonical client services; `onboarding_blocker` retains explicit blockers.

Onboarding does not introduce another workflow engine. When an onboarding template is configured, the conversion service creates a normal `work_item`, copies published `work_template_stage` definitions into `work_stage`, and copies template tasks into `practice_task` with immutable version provenance. Normal PM-004 stage/task/review APIs remain authoritative.

Moving to ready-for-delivery or completed fails closed while any explicit blocker, mandatory task or workflow stage remains open. Completion requires `onboarding.complete`, sets the case gate, and advances linked client-service delivery readiness. Commercial acceptance alone never represents operational readiness.

The UI provides an onboarding work table and case detail with status, actions, stages, blockers, engagement and services. AML/KYC is not implemented; a future specialist module may participate through a bounded gate/event contract.
