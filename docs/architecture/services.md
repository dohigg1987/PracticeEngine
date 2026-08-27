# Practice services

## Service catalogue

`practice_service` is the tenant-scoped catalogue of professional services. A service records name, description, category, lifecycle status, default frequency, responsible team, default work template, optional specialist module and optional required feature entitlement. Module association and licensing are stable keys from the Platform catalogue; package names are not behaviour switches.

The model is intentionally profession-neutral. Annual accounts, bookkeeping, VAT, corporation tax, payroll, management accounts, independent examination, company secretarial and advisory are valid examples, but no accounting-only constraint is imposed on future service categories.

## Client services

`client_service` records that a canonical client receives a catalogue service. It retains effective dates, frequency, responsible member/team, specialist module and bounded structured configuration. PM-003 prevents overlapping active instances of the same service at the database level. Legitimate parallel delivery uses an explicit `instance_key`, preserving engagement-specific or otherwise discriminated configurations.

Activation validates the client and catalogue service inside the authenticated tenant. Any service-required entitlement is evaluated server-side. Ledgerly-backed services additionally require `ledgerly.enabled` and their configured feature entitlement. Activation and termination append immutable audit evidence and normalized `service.activated` or `service.terminated` outbox events.

## Lifecycle and permissions

Catalogue management requires `services.manage`; reads require `services.view`. Client-service mutations use the management permission plus `practice.enabled` and `practice.work`. Records are never hard deleted through the runtime service. Inactivation is reversible; termination is an effective-dated terminal business state.
