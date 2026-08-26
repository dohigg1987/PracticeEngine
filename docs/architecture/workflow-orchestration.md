# Workflow orchestration

Practice Management owns operational delivery workflow. Specialist modules retain their technical states and sign-offs; a Ledgerly technical review is not a Practice workflow stage.

Published `work_template` versions contain ordered `work_template_stage` definitions and tasks may point to a stage. Recurrence generation copies active definitions into `work_stage` and records template ID, version and source-stage provenance. Later template changes cannot rewrite generated work.

Stages support preparation, client input, internal review, approval, specialist execution and completion. Runtime states are not started, active, blocked, waiting, review, completed and explicitly skippable. The API permits only declared transitions and evaluates structured gates for mandatory tasks, approval, predecessor stages, specialist completion and authorised manual release. Work completion fails closed while stages or reviews remain open; an override requires `review.override`, a reason, audit and outbox evidence.

Task dependencies support finish-to-start, start-to-start and explicit blocking. Both API graph validation and a database trigger reject cycles and cross-work relationships. Unresolved blockers are returned with work detail. Resolution is explicit and audited.

All workflow mutations use the Platform Core tenant transaction, functional permissions, the `practice.workflow` entitlement, immutable audit events and transactional outbox facts.

PM-005 onboarding is an application of this engine, not a parallel workflow. An onboarding case may instantiate a published template into ordinary work stages and tasks. Explicit blockers and every mandatory stage/task must clear before the case can become ready for delivery or completed.
