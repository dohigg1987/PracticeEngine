# Ledgerly client compatibility

## Current and target models

Ledgerly currently treats `organisation` as the legal-entity/client anchor. Accounts engagements reference it through `engagement.organisation_id`; permanent-file, portal, integration and many accounting records resolve through the same tenant-qualified relationship.

The PM-001 target keeps that exact `organisation.id` as the canonical Practice client ID and expands the record with universal client fields. There is therefore no client-to-client mapping table and no synchronization of duplicate client masters.

## Compatibility strategy

This uses preferred approach 1: Ledgerly directly references the canonical client ID because its existing foreign key already does so. Existing `/v1/organisations`, `/v1/engagements`, permanent-file and portal contracts are unchanged. New consumers use `/v1/clients` and receive the expanded canonical shape.

The legacy one-organisation `client_contact` records are retained because portal identity/access currently depend on them. Migration `0029` backfills them into reusable `contact` records and relationship rows with an explicit legacy reference. No dual-write to the legacy contact table is attempted; portal contact migration requires a later focused compatibility increment.

## Migration path and rollback

Consumers move individually from organisation adapters to the canonical client service. Before changing portal contact ownership, reconcile `client_contact` to `contact.legacy_client_contact_id` and relationship counts on a disposable Neon branch. Ledgerly accounting records require no client-ID backfill.

Rollback disables the new routes and restores the database from the pre-`0029` Neon branch/PITR point if needed. All legacy data and APIs remain present, so application consumers can be routed back without identifier translation.

## Risks

- Legacy portal contacts and new canonical contacts can diverge until portal consumers migrate.
- Existing organisation rows derive `display_name` from `legal_name` and default entity type to `OTHER`; controlled data enrichment is still required.
- Existing Ledgerly routes retain legacy role checks until each is migrated to permission keys.
- Migration execution has not been applied to production and must first be validated on a disposable Neon branch.
