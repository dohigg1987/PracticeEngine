# Settings ownership

Settings are split by owner rather than presented as one module-neutral tree.

PracticeEngine global settings own organisation, users, teams, security, branding, integrations, subscription, applications/entitlements and platform-wide notifications. Their canonical namespace is `/settings/...` and they remain subject to Platform permissions.

Practice Management settings own the service catalogue, work templates, operational workflow/automation, resource/economic configuration and portal/collaboration configuration. Their namespace is `/practice/settings/...`.

Ledgerly settings own accounting, accounts-production and filing configuration only under `/ledgerly/settings/...`. QuoteBench settings own proposal/pricing configuration through its deployment boundary. Clarity IE settings are reserved but absent because Clarity IE is not implemented.

Moving a setting in the UI does not move its underlying data or weaken authorization. Existing Platform and application APIs remain the enforcement boundaries.
