# Entitlement implementation

## Model

The commercial kernel contains read-only product, module and feature catalogues plus tenant-owned entitlements and overrides. Application logic evaluates stable feature keys and never package names. Effective records support start/end dates, boolean enablement, optional structured values and provenance.

`tenant_feature_decision(featureKey)` first selects the newest active tenant override, then the newest active base entitlement. No active record means disabled. The API exposes the resulting enabled value, source and decision ID to actors with `entitlements.view`.

## Seeded catalogue

Ledgerly is represented as the `ledgerly` product/module with `ledgerly.enabled`, `ledgerly.ledger`, `ledgerly.accounts` and `ledgerly.filing`. Practice Management keys are `practice.enabled`, `practice.clients`, `practice.work`, `practice.workflow` and `practice.portal`.

To preserve current behaviour, every existing and newly created tenant receives transitional enabled Ledgerly entitlements. `practice.clients` is also transitional-enabled because the existing client capability is already live. This is an internal grandfathering record, not a commercial package. No billing or subscription provider is integrated.

Overrides are data, not code conditionals, and are tenant-scoped/RLS-protected. PM-001 does not expose override mutation through a public route; a later commercial administration service must add authorization, reason capture and `ENTITLEMENT_CHANGED` audit events before runtime administration is enabled.
