# Work management

## Work items

`work_item` is the operational deliverable beneath a client service and Practice engagement. It records client, service, period/reference, title, status, priority, assignments, planned/due/completion dates, specialist module and opaque module record reference. Composite foreign keys prevent a work item from joining records belonging to different tenants, clients or services.

Initial statuses are `not_started`, `ready`, `in_progress`, `waiting_on_client`, `waiting_internal`, `review`, `completed` and `cancelled`. PM-002 implements explicit safe transitions, not a general workflow engine. Assignment, status and completion commands use `work.assign`, `work.edit` and `work.complete` respectively and emit `work.assigned`, `work.status_changed` and `work.completed` facts.

## Tasks

`practice_task` belongs to one work item and records title, description, status, assignee, team, reviewer, sequence and due/completion dates. Initial states are `not_started`, `in_progress`, `blocked`, `review`, `completed` and `skipped`. Tenant isolation applies to every read and mutation through qualified application queries and forced RLS.

Task reads require `tasks.view`; task creation, assignment and transitions require `tasks.manage`. Creation, assignment, status and completion are audited transactionally; completion emits `task.completed`.

## Templates

`work_template` and ordered `work_template_task` records provide configuration-driven reusable task structures for one service. Templates are versioned and can define default role/team, due-date offsets and mandatory/optional tasks. PM-002 provides template definition and management; work/task instantiation from templates is deferred. Recurrence, deadline rules, automation and visual workflow design are also excluded.

## UI

The Practice work list uses Fluent structured data patterns with client, service, period, status, assignment, due date and priority filters. Work detail presents operational context, tasks and the related Ledgerly record without exposing internal storage or infrastructure values. Client summary presents active services, engagement state, current work and upcoming deadlines.
