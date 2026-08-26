# Practice Management foundation

## Implemented boundary

Practice Management is the operational system of record for services delivered to the canonical client identified by `organisation.id`. PM-002 adds service catalogue, client-service, generic engagement, work-item, task and versioned work-template records alongside the existing Ledgerly accounts-production model. It does not rename, delete or broaden Ledgerly accounting tables.

The operational chain is:

`Client -> Client Service -> Practice Engagement -> Work Item -> Practice Task -> Specialist Module Execution`

Practice records are tenant owned, permission checked in the Worker, entitlement checked where a feature or specialist module is involved, and protected by forced PostgreSQL RLS. Material commands append the existing hash-chained audit record and transactional outbox fact in the same database transaction.

## Application boundary

`apps/api/src/practice-management.ts` is the Practice Management application-service seam. It is composed by the existing Cloudflare Worker after Neon Auth verification and reuses Platform Core transaction context, permission, entitlement and audit/outbox services. Its routes live below `/v1/practice` and do not replace current `/v1/organisations`, `/v1/engagements` or Ledgerly workflow routes.

The web shell adds Practice Management work, client summary and configuration surfaces using Fluent UI React v9. Browser visibility remains presentational; the Worker and Postgres remain the security boundaries.

PM-003 adds published template instantiation, recurring schedules, deterministic recurrence/deadline evaluation, bounded idempotent generation, deadline override provenance and member display labels. Recurrence and deadline rules remain separate. The Cloudflare scheduled adapter is present but no production Cron Trigger is deployed.

## Compatibility and rollback

The current `organisation` identifier remains the client key. The current Ledgerly `engagement` remains the accounts-production workspace and can be linked one-to-one to a Practice work item through an explicit tenant-safe relation. Existing Ledgerly tasks and review points remain intact.

Rollback is to stop routing the new application service and restore the disposable/pre-migration Neon branch or PITR point. Migrations `0030` and `0031` are additive and no previous table, column, route, event or object is removed.

PM-005 adds the commercial chain `Prospect -> Opportunity -> QuoteBench reference -> Acceptance -> Canonical client/services/engagement -> Onboarding -> Work`. CRM and onboarding remain Practice-owned; proposal pricing/content remain QuoteBench-owned. Migration `0033` is additive and preserves all earlier identifiers and routes.
