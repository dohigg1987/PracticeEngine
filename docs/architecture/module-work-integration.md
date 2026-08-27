# Specialist module and work integration

## Contract

Practice Management owns responsibility, assignment, due date, operational status and overall task coordination. Specialist modules own execution. A work item carries a stable module key and opaque record reference; module-specific tables are not manipulated by the Practice service.

For Ledgerly, `work_item_ledgerly_link` is the minimum explicit adapter. It relates one tenant/client-qualified Practice work item to one existing tenant/client-qualified Ledgerly `engagement`. One Ledgerly workspace cannot be silently attached to multiple operational jobs. The adapter never copies or writes trial balances, journals, reconciliations, working papers, disclosures, accounts versions, sign-offs or filing evidence.

## Authorization and licensing

Creating or linking Ledgerly-backed work requires the relevant functional Practice permission plus `ledgerly.enabled`. Accounts-production work also requires `ledgerly.accounts`, or the stricter configured service feature. These checks run in the Worker and are reinforced by database constraints/guards for link creation. Navigation visibility is not an entitlement decision.

Existing tenants retain explicit transitional Ledgerly feature entitlements introduced by PM-001. No package name or browser flag grants module access.

## Events

Practice lifecycle events use the existing transactional outbox. Ledgerly's existing audit event names remain historical evidence; selected Ledgerly lifecycle writes also publish normalized `ledgerly.workspace.created`, `ledgerly.accounts.started`, `ledgerly.accounts.completed` and `ledgerly.filing.submitted` facts through compatibility mappings. Linking existing work is recorded separately and does not falsely claim a new accounting workspace was created.

## Failure and rollback

Link validation, domain mutation, audit and outbox append occur transactionally. A failure leaves neither a partial work link nor a misleading event. Removing the new route from composition restores the prior Ledgerly-only flow without identifier translation; database rollback uses the pre-`0030` Neon branch/PITR point.
