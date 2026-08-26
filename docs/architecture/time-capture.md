# Time capture

## Optional operational capability

Time capture is enabled by `practice.time` and remains optional per tenant. A `time_entry` records tenant member, date, client, engagement when applicable, client service, work item, optional task, duration, narrative, billable classification and status. Entry is direct or contextual from accessible work; PM-007 does not introduce timers or a full timesheet workflow.

Composite foreign keys prove that client, engagement, service, work and task belong to one tenant and form a valid relationship. Application lookups repeat those tenant and access checks. Cross-tenant IDs, inaccessible work and mismatched client/work combinations fail before mutation.

## Status and approval seam

The supported states are `draft`, `submitted`, `approved` and `rejected`. Approval metadata is present only for approved entries. `time.enter` permits entry for the actor's own tenant-member record; `time.view`, `time.manage` and `time.approve` control broader reads, correction and approval. Approval is a restrained optional seam, not a configurable workflow engine.

Create and material update commands append audit events transactionally. External effects, if later required, use the existing outbox; passive viewing is not audited.

## Historical valuation

When an applicable effective-dated cost rate is available, valuation captures the rate ID, rate value, basis, currency and calculated cost snapshot on the entry. A later rate change therefore cannot rewrite approved or previously valued time. Billable value is nullable and is captured only when supported by a named source; it is not inferred from cost or fabricated from duration.

| Field/value | Classification |
| --- | --- |
| Duration, narrative, classification and status | Transactional |
| Cost rate definition | Transactional, effective-dated and restricted |
| Cost rate/value/cost amount on an entry | Historical snapshot |
| Current period totals | Derived |
| Billable value with no pricing source | Unavailable (`null`), never zero |

Cost snapshots and profitability derived from them require the more restrictive cost/economics permissions; ordinary time access does not imply access to an individual's internal rate.
