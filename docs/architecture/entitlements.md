# Entitlement implementation

## Model

The commercial kernel contains read-only product, module and feature catalogues plus tenant-owned entitlements and overrides. Application logic evaluates stable feature keys and never package names. Effective records support start/end dates, boolean enablement, optional structured values and provenance.

`tenant_feature_decision(featureKey)` first selects the newest active tenant override, then the newest active base entitlement. No active record means disabled. The API exposes the resulting enabled value, source and decision ID to actors with `entitlements.view`.

## Seeded catalogue

Ledgerly is represented as the `ledgerly` product/module with `ledgerly.enabled`, `ledgerly.ledger`, `ledgerly.accounts` and `ledgerly.filing`. Practice Management keys are `practice.enabled`, `practice.clients`, `practice.work`, `practice.workflow` and `practice.portal`.

To preserve current behaviour, every existing and newly created tenant receives transitional enabled Ledgerly entitlements. `practice.clients` is also transitional-enabled because the existing client capability is already live. This is an internal grandfathering record, not a commercial package. No billing or subscription provider is integrated.

Overrides are data, not code conditionals, and are tenant-scoped/RLS-protected. PM-001 does not expose override mutation through a public route; a later commercial administration service must add authorization, reason capture and `ENTITLEMENT_CHANGED` audit events before runtime administration is enabled.

PM-005 registers `practice.crm` and `practice.onboarding` as Practice capabilities. QuoteBench is a separate product/module with `quotebench.enabled`, `quotebench.proposals`, `quotebench.pricing`, `quotebench.templates` and `quotebench.esign`. Existing Practice tenants receive transitional CRM/onboarding access to preserve the staged pilot; QuoteBench is not grandfathered and must be explicitly entitled.

PM-006 makes the existing `practice.portal` parent capability operational and registers `practice.portal.requests`, `practice.portal.documents` and `practice.portal.messaging`. Existing tenants receive transitional enabled records for the Practice capabilities on this staged pilot branch; application code still evaluates the stable feature keys and never package names.

Staff collaboration routes require `practice.enabled`, `practice.portal`, the surface entitlement and a functional permission. Portal routes require the parent/surface entitlement plus an active principal and explicit client/resource relationship. Entitlement is therefore neither staff authorization nor client authorization. Machine-delivered QuoteBench events use a tenant-scoped security-definer decision function for `quotebench.enabled` and `quotebench.proposals`; signature verification does not bypass commercial control.

PM-006 adds staff permissions `portal.manage`, `portal.invite`, `portal.revoke`, `client_requests.view`, `client_requests.manage`, `documents.share`, `portal_messages.view`, `portal_messages.send` and `confirmations.request`. These permissions are not assigned to portal principals. The seeded OWNER role receives the management set; MEMBER receives the documented read permissions only.
