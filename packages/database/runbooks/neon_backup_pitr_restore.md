# Neon backup, PITR, and restore runbook

## Scope and observed production posture

This runbook covers the Accounts Production Neon project `square-firefly-75076140`, production branch `br-steep-river-za33xwvi`, and database `neondb`. Record all operational times in UTC.

The posture observed on 2026-08-18 was:

- the production branch is the root, default, and primary branch
- the configured history retention window is 21,600 seconds, or 6 hours
- production branch protection is disabled
- the available project integration could not enumerate snapshot schedules or completed snapshots
- public database connections are not blocked and no project IP allow list is configured

These observations are evidence, not desired-state configuration. Before a controlled commercial pilot, an accountable owner must document the recovery-point and recovery-time objectives and confirm the Neon plan supports them.

## Pilot release gates

1. Configure a restore window of at least 7 days, or a longer approved recovery-point requirement. Thirty days is preferred where the subscribed Neon plan and cost approval permit it.
2. Enable production branch protection and test the authorized break-glass process.
3. Establish and evidence automated snapshots. A reasonable pilot starting point is daily snapshots retained for 35 days and monthly snapshots retained for 13 months, subject to plan limits, cost approval, and the retention schedule.
4. Create and record a named snapshot before every production schema release. Use a name such as `accounts-prod-20260818T1200Z-pre-0017`.
5. Complete a non-destructive recovery drill at least quarterly and before the first external pilot. Record achieved RPO, RTO, reconciliations, approvers, and evidence links.
6. Decide whether public connections are required for Hyperdrive and operational access. If they are, document compensating controls. Otherwise configure IP restrictions or private connectivity as supported.

## Pre-release recovery evidence

- Record the release identifier, current production branch ID, UTC time, migration head, database size, and snapshot ID.
- Confirm the snapshot or point-in-time falls inside the configured restore window.
- Confirm the person approving restoration is different from the person executing it where staffing permits.
- Never place Neon API keys, database passwords, or connection strings in this repository or the evidence record.

## Non-destructive restore drill

This is the normal verification procedure. It does not replace production state.

1. Define the incident or drill timestamp in UTC. Record the source branch and, when available, the source LSN.
2. Use Neon Time Travel for a read-only inspection when it can answer the recovery question without creating a branch.
3. Create a point-in-time branch or restore a snapshot with preview semantics. For snapshot restore, use `finalize_restore=false`. Do not point production traffic at the preview.
4. Wait for all Neon operations to complete before connecting.
5. Connect with a read-only credential and run `neon_restore_verification.sql`.
6. Use non-production service bindings to run tenant isolation and application smoke tests. Never reuse production Hyperdrive or R2 write bindings for the drill.
7. Reconcile representative tenant counts, migration head, reporting catalog counts, hashes, and orphan checks against the source evidence.
8. Record achieved RPO and RTO, discrepancies, reviewer approval, preview branch ID, and evidence location.
9. Delete the preview branch only after evidence approval and after confirming it is not the production branch.

## Emergency production restore

This section is a break-glass procedure and was not executed while preparing this runbook.

1. The incident commander and database owner approve a production restore and a communications plan.
2. Stop or fence application writes. Record the last known good UTC timestamp or LSN.
3. Preserve the current production state with a snapshot when doing so is safe.
4. Complete the preview restore and verification above first unless the incident commander explicitly accepts the additional risk and records why.
5. Use the Neon production restore operation only after signed approval. A production restore can interrupt active connections.
6. Poll the operation to completion, then run `neon_restore_verification.sql` and the authenticated tenant isolation smoke suite.
7. Confirm application connection routing and stored branch identifiers. Preserve any old or orphaned branch until reconciliation is complete.
8. Re-enable writes only after database, application, security, and accounting reconciliations pass.

## Evidence record

Each drill or restore record must include the source point, target branch, Neon operation IDs, snapshot ID where applicable, operator, approver, start and end UTC times, achieved RPO/RTO, verification output, exceptions, and final disposition.

## Authoritative references

- [Neon project restore-window settings](https://neon.com/docs/manage/projects)
- [Neon branch restore and Time Travel](https://neon.com/docs/introduction/branch-restore)
- [Neon snapshot restore workflow and API behavior](https://neon.com/docs/ai/ai-database-versioning)
