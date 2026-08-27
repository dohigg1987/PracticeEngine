# PracticeEngine application shell

PracticeEngine is the suite and platform identity. The React deployment remains a modular monolith, but the UI boundary is explicit: the global shell owns the PracticeEngine brand, application launcher, tenant context, global search, notifications/account affordances, global settings and the active-workspace container. It does not own specialist navigation.

The route selects one application manifest. The sidebar renders only `activeApplication.navigation`; switching applications changes that manifest without changing the selected tenant, authenticated user or global notification state. The document title is `<application> · PracticeEngine`. Ledgerly retains its name inside its workspace and application-specific settings.

The launcher shows only applications whose effective `*.enabled` decision is returned by `GET /v1/platform/entitlements/:featureKey`. UI visibility is presentation, not authorization. Existing application APIs continue to enforce tenant membership, functional permissions and entitlements server-side. A direct route whose effective application entitlement is false renders an unavailable boundary and cannot use the underlying protected APIs.

The shell is compact Fluent UI React v9 chrome: neutral surfaces, standard menu/navigation components, semantic tokens and no product-theme fork. Application identity uses a name and Fluent icon; no gradient, decorative tile or marketing card is introduced.

Rollback is additive: retain the legacy redirects and restore the former shell rendering while leaving all domain/API/database structures unchanged. This refactor adds no migration and changes no Cloudflare, Neon or R2 resource.

## Branding audit

| Occurrence family | Classification | Action |
| --- | --- | --- |
| `apps/web/index.html`, global header, authentication/account onboarding copy | incorrect visible suite branding | changed to PracticeEngine |
| active Ledgerly app identity, accounting confirmation/evidence copy in `EngagementProduction.tsx` | legitimate Ledgerly module identity | retained |
| Ledgerly work/service descriptions and demo evidence in `demo.ts` | legitimate module/test-fixture identity | retained |
| legacy Pages host checks in `auth.ts`/`api.ts` | technical/internal compatibility identifier | retained |
| migrations, database objects, Cloudflare/Neon/R2 names and historical architecture prose | technical or historical compatibility reference | retained; no infrastructure rename |
