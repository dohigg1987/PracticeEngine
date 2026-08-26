# Work management

## Work items

`work_item` is the operational deliverable beneath a client service and Practice engagement. It records client, service, period/reference, title, status, priority, assignments, planned/due/completion dates, specialist module and opaque module record reference. Composite foreign keys prevent a work item from joining records belonging to different tenants, clients or services.

Initial statuses are `not_started`, `ready`, `in_progress`, `waiting_on_client`, `waiting_internal`, `review`, `completed` and `cancelled`. PM-002 implements explicit safe transitions, not a general workflow engine. Assignment, status and completion commands use `work.assign`, `work.edit` and `work.complete` respectively and emit `work.assigned`, `work.status_changed` and `work.completed` facts.

## Tasks

`practice_task` belongs to one work item and records title, description, status, assignee, team, reviewer, sequence and due/completion dates. Initial states are `not_started`, `in_progress`, `blocked`, `review`, `completed` and `skipped`. Tenant isolation applies to every read and mutation through qualified application queries and forced RLS.

Task reads require `tasks.view`; task creation, assignment and transitions require `tasks.manage`. Creation, assignment, status and completion are audited transactionally; completion emits `task.completed`.

## Templates

`work_template` and ordered `work_template_task` records provide configuration-driven reusable task structures for one service. Templates define default role/team, due-date offsets and mandatory/optional tasks. PM-003 publishes immutable historical versions and instantiates work/tasks with source provenance. Recurrence and deadline rules are separate application services; arbitrary automation and visual workflow design remain excluded.

## UI

The Practice work list uses Fluent structured data patterns with client, service, period, status, assignment, due date and priority filters. Work detail presents operational context, tasks and the related Ledgerly record without exposing internal storage or infrastructure values. Client summary presents active services, engagement state, current work and upcoming deadlines.

## PM-007 planning and effort extension

`work_item` remains the single operational work anchor. PM-007 adds planned end, planned/estimated/remaining effort, estimate provenance, review member and assignment state without creating a parallel planning item. Estimates may originate from a template, manual override or later historical derivation and remain optional. Template/task estimates instantiate with their provenance; an explicit work estimate is authoritative over child-task totals to prevent double counting.

Current assignment stays on `work_item`; each reassignment also appends `work_assignment_history` with previous/new resource and team, reviewer, planned period/effort, state, reason and actor. Inactive/cross-tenant assignment is invalid. Authorized over-allocation is allowed and surfaced by capacity reporting.

Generated recurring work is committed load. A not-yet-generated recurring occurrence may be shown only as separately labelled forecast load. Capacity, time capture and economics therefore reuse the existing client-service-engagement-work graph and never create a second work master.
