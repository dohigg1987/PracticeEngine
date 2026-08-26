# Recurring work

`recurring_work_schedule` belongs to a tenant, canonical client, active client service and one immutable published work-template version. Optional engagement, deadline rule, member/team defaults and specialist-module keys preserve the PM-002 ownership chain. Rules are profession-neutral JSON interpreted by the deterministic Practice scheduling core; supported frequencies are weekly, monthly/every-N-months, quarterly, annually, month/day and period-end-relative.

Generation is bounded by `periods`, `date` or `next` horizons. `recurrence_generation` records the occurrence and period with unique tenant/schedule/occurrence and idempotency keys, so retries cannot create duplicate work even under concurrent execution. Schedule suspension preserves configuration and history. Ledgerly entitlement loss changes the schedule to `blocked_entitlement`; it does not delete the schedule or historical work.

Operational execution history, mutation-free dry runs, bounded 93-day replay and failure visibility are defined in [recurrence-operations.md](recurrence-operations.md). Replay reuses this same idempotent generation path.

Recurrence establishes occurrences and periods only. Due dates are owned by the separate deadline engine.
