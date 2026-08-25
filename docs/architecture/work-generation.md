# Work generation

The Practice application service evaluates a schedule, entitlement and horizon, claims a unique generation marker, creates the work item, instantiates ordered tasks, appends hash-chained audit evidence and writes transactional outbox facts in one database transaction. A failure rolls back the marker and all generated records. Repeated or concurrent runs use the database uniqueness constraint as the final idempotency boundary.

Specialist records are not created by recurrence. Generated work records only the stable module key. Ledgerly execution is created lazily or linked explicitly through `work_item_ledgerly_link`, preserving Ledgerly ownership and preventing duplicate accounting workspaces.

The initial dependency foundation supports explicit finish-to-start task edges only. A workflow designer, capacity scheduling and arbitrary automation remain excluded.
