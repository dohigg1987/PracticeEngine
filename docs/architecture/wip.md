# Operational WIP

## Definition

PM-007 WIP is an operational management measure of performed work not yet economically recovered or closed. It is not a statutory WIP valuation, receivables subledger or general ledger.

For one tenant, currency and reporting period:

- actual effort is approved/eligible time duration;
- internal cost is the sum of captured cost snapshots;
- billable value is the sum of supported entry value snapshots or an allocated accepted/authorised value under a documented rule;
- billed/recovered value is the sum of supplied `billing_recovery` facts by their explicit type;
- WIP balance is calculated only when the selected value basis and applicable recovery evidence are available.

Cost-based and value-based WIP are labelled separately. Credits and write-offs retain their type and sign treatment in the calculation; they are not silently collapsed into billed value.

## Unknown is not zero

No commercial context means value-based WIP is unavailable. No supplied billing/recovery feed means billed/recovered and dependent balances are unavailable, even when no rows exist. A zero is displayed only when the data source positively establishes a zero for the requested scope/period. The API returns value plus status/provenance rather than coercing nullable values through `COALESCE(..., 0)`.

## Provenance and reproducibility

Each result identifies calculation period, currency and contributing time entry, cost-rate snapshot, commercial-context and recovery records. Normal dashboards derive the result on read. A published period result may be snapshotted for historical reproducibility, but the snapshot includes calculation version and source references and never replaces transactional facts. Any cache is disposable.

## Security and ownership

Practice Management owns operational WIP; Ledgerly is not written to and remains authoritative for accounting. WIP reads require `practice.wip` and `economics.view`; management reporting may additionally require `practice.reporting`. Inputs use forced RLS and economics-restricted policies. Overrides, when permitted, require `economics.manage`, reason/provenance and immutable audit coverage.
