# Cloudflare scheduling

The recurrence engine is independent of its trigger. Authenticated API commands support operational generation and the Worker exports a `scheduled()` adapter compatible with Cloudflare Cron Triggers. No production cron is configured or deployed. PM-004 records each scheduled context in tenant-scoped recurrence execution history, including evaluated schedules, generated work, entitlement blocks and failures.

`RECURRENCE_EXECUTION_CONTEXTS` is an explicit JSON list of tenant IDs and active member actors used as service principals. Each actor must independently hold recurrence visibility/operations and work-generation permissions; the normal Practice entitlements, tenant transaction context and forced RLS remain in force. The checked-in default is `[]`, so an accidental scheduled invocation performs no tenant work. Production activation requires a reviewed environment-specific Cron Trigger and execution contexts.

Cloudflare Cron runs in UTC. Tenant timezone remains a recurrence/deadline input rather than changing the trigger clock. Every schedule is transactionally independent, idempotent and safe to retry. Wrangler local scheduled-event testing and `deploy --dry-run` cover the adapter without a long-running process or another scheduler.

PM-005 adds a separate notification delivery entrypoint backed by the existing transactional outbox and a publisher-only Hyperdrive role. It is Cloudflare scheduled-handler compatible, but no production trigger or credential is configured. Notification failures are per-item and bounded; recurrence and notification execution do not share mutable request state.
