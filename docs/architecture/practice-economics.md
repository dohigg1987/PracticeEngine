# Practice economics

## Boundary

PracticeEngine owns explainable management economics for operational work. Ledgerly remains the accounting ledger and accounts-production specialist. PM-007 does not post journals, issue invoices, collect payments or assert statutory balances.

The calculation chain is `approved effort -> captured cost snapshot -> accepted/authorised commercial context -> supplied billing/recovery evidence -> contribution and WIP`. Each stage retains tenant, client, service, engagement/work where present, currency, source and calculation period.

## Value classes

| Class | PM-007 values | Persistence rule |
| --- | --- | --- |
| Transactional | Time entries, effective-dated cost rates, commercial context, billing/recovery facts | Authoritative source records; material changes audited |
| Derived | Actual effort, total internal cost, WIP, average effort, contribution and margin | Recalculate deterministically from eligible source records |
| Cached | Optional query/read-model results | Disposable; never the source of truth and invalidated by source changes |
| Snapshot | Entry cost valuation and published historical report values | Retain inputs, source IDs, currency and calculation period for reproducibility |

Amounts have an availability/status alongside the number. `known` means an authoritative source exists, `calculated` means all required known inputs were combined deterministically, `estimated` means a labelled estimate was used, and `unavailable` means a required source is absent. A known zero is `0`; unavailable is `null`. Aggregation must propagate unavailable inputs where the requested metric cannot be calculated safely.

## Cost and commercial evidence

`resource_cost_rate` is effective-dated by member, currency and hourly/daily basis; overlapping periods are prohibited. Rates are restricted by `costrates.view`/`costrates.manage`. Historical time valuation stores its applicable rate and calculated cost snapshot so a later rate record never rewrites prior economics.

`work_commercial_context` records a known or estimated agreed value, currency, billing model/frequency, effective period and source. A QuoteBench source must reference the accepted proposal record and version. Manual context requires explicit authorization and provenance. No service fee is derived from internal cost.

`billing_recovery` records externally evidenced billed, recovered, credit or write-off facts. These are operational references, not ledger entries. Absence of a recovery record means unavailable, not zero billed or zero recovered.

## Aggregations

Client and service views aggregate compatible currencies and periods only. They expose effort and cost whenever those inputs are complete, revenue/value only where commercial evidence exists, recovery only where supplied, and contribution/margin only where the relevant value and cost are both calculable. Mixed currency totals are unavailable unless a governed conversion source is introduced later.

The service view adds active client volume and average effort. The engagement/work view exposes planned effort, actual effort, cost and an explainable economic status. Every management metric links back to its time, cost-rate, commercial and recovery evidence.

## Controls

Economics requires `practice.economics` and `economics.view`; commercial/recovery changes require `economics.manage`. `practice.reporting` governs management reporting separately. Forced RLS, tenant-safe foreign keys and least-privilege grants protect all source tables. Material cost, commercial and recovery changes append immutable audit events; integration publication uses the transactional outbox without duplicating the audit fact.
