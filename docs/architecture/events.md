# Initial domain event catalogue

## Event envelope

Use the existing immutable `audit_event` and transactional `outbox_event` foundations. A modular-monolith event dispatcher is preferred initially; this document does not require a distributed event platform.

Every event should carry:

| Field | Meaning |
|---|---|
| `eventId` | Globally unique immutable event identifier. |
| `eventType` | Stable lower-case catalogue name. |
| `occurredAtUtc` | Business occurrence time in UTC. |
| `recordedAtUtc` | Ledger persistence time in UTC. |
| `tenantId` | Required tenant boundary. |
| `actor` | Actor type and stable actor reference. |
| `subject` | Aggregate type, identifier and post-mutation version. |
| `correlationId` | End-to-end operation correlation. |
| `causationId` | Optional command or prior event identifier. |
| `payloadVersion` | Integer schema version independent of event name. |
| `payload` | Minimum business fact required by authorized consumers; never credentials or raw file contents. |

Events describe completed facts. Consumers must be idempotent by `eventId`. Sensitive payload fields require an explicit data-classification decision; prefer identifiers over replicated personal data.

## Catalogue

| Event | Owner | Trigger and minimum payload |
|---|---|---|
| `client.created` | Practice Management | Canonical client created; client ID, legal/display name, status. |
| `client.updated` | Practice Management | Client version changed; client ID, changed field names, version. |
| `client.archived` | Practice Management | Client archived; client ID, reason reference, archived time. |
| `service.activated` | Practice Management | Service enabled for client; service/client IDs, effective date. |
| `service.terminated` | Practice Management | Service ended; service/client IDs, effective date and reason category. |
| `engagement.created` | Practice Management | Generic engagement created; client, service and engagement IDs. |
| `engagement.activated` | Practice Management | Engagement activated; engagement ID, client ID and effective date. |
| `engagement.completed` | Practice Management | Engagement completed; ID, completion time and version. |
| `engagement.terminated` | Practice Management | Engagement terminated; ID, effective time and reason category where recorded. |
| `work.created` | Practice Management | Operational work created; work, engagement/service/client IDs and due date. |
| `work.assigned` | Practice Management | Work responsibility changed; work ID and member/team references. |
| `work.status_changed` | Practice Management | Work status changed; work ID, prior/current states and version. |
| `work.completed` | Practice Management | Work completion accepted; work ID, completion time and version. |
| `task.completed` | Practice Management | Task completed; task/work IDs and completion actor/time. |
| `document.uploaded` | Platform Core | Authorized document version stored; document/version IDs, classification, hash, byte size. No storage key in public payloads. |
| `proposal.accepted` | QuoteBench or owning proposal module | Proposal accepted; proposal/client IDs and accepted version. |
| `ledgerly.workspace.created` | Ledgerly | Ledgerly capability initialized for tenant/client context; module workspace and shared reference IDs. |
| `ledgerly.accounts.started` | Ledgerly | Accounts-production work started; Ledgerly engagement ID, shared job/engagement references, period/framework. |
| `ledgerly.accounts.completed` | Ledgerly | Accounts work completed/released; engagement and accounts-version IDs. |
| `ledgerly.filing.submitted` | Ledgerly | External filing submission evidence recorded; filing attempt/accounts-version IDs, regulator and submitted time. It does not imply direct API submission. |

## Compatibility mapping

Existing upper-case audit types remain authoritative historical records. Introduce catalogue names for new writes or through a versioned adapter; do not rewrite historical events. During transition, one transaction may append the existing audit record and enqueue a normalized domain event sharing the same correlation/causation chain.

## Governance

- Event names and owners require architecture review.
- Breaking payload changes require a new `payloadVersion` and compatible consumers.
- Audit records are evidence; outbox delivery records are operational state. Do not conflate them.
- Failure to publish does not roll back the already committed business fact; retries and dead-letter handling remain bounded and observable.
