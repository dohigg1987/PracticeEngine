# Constrained automation engine

Practice automation is an event-condition-action foundation, not a scripting platform. `practice.automation` is an independently controllable entitlement. Rules are tenant-owned, ordered, effective-dated and enabled explicitly.

Allowed triggers are a fixed vocabulary covering work, stage, task, deadline, operational review, recurrence and received specialist events. Conditions use allowed fields and equality, membership, existence and numeric-bound operators. Actions are restricted to assignment, operational status, task/review creation, notification requests and block/unblock operations. Arbitrary SQL, executable code and webhooks are rejected.

Execution is transactional and tenant scoped. A stable key composed from tenant, rule, source event and aggregate makes delivery idempotent. A maximum eight-rule causation chain and repeated-rule detection prevent recursion. Outcomes and bounded error summaries are stored in `automation_execution`; success and failure append immutable audit and outbox facts. Actions cannot complete work or bypass workflow approval gates, and specialist entitlements remain outside automation authority.
