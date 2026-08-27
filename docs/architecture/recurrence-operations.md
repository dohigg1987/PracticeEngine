# Recurrence operations

PM-004 adds operational control around the PM-003 generator. `recurrence_execution` records scheduled, manual, dry-run and replay activity with counts, diagnostics, actor/correlation context and terminal status. Per-schedule/occurrence outcomes are retained in `recurrence_execution_item`.

Dry run evaluates tenant schedules, recurrence dates, prospective deadlines, entitlement blocks and existing idempotency markers without creating work, tasks, stages or generation markers. It emits only `recurrence.dry_run_completed`, never a normal generation fact.

Replay requires `recurrence.replay`, ISO bounds and a maximum inclusive range of 93 days. It calls the same idempotent occurrence-instantiation path as normal generation, so existing tenant/schedule/occurrence markers are duplicate-safe. Replay start/completion and failures are audited. Failed execution history remains visible for diagnosis and controlled recovery.

The Cloudflare scheduled handler still reads explicit tenant/actor contexts from `RECURRENCE_EXECUTION_CONTEXTS`. The repository default is `[]`; no production cron is configured. Each context executes through normal tenant membership, permission and entitlement checks and now records a scheduled execution summary. No broadly privileged cross-tenant database loop exists.
