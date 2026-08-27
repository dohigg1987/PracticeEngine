# Application navigation map

This audit classifies every primary item in the pre-refactor integrated sidebar at commit `e32e295c482f8eaa13ef50410b88212681be964d`. Ownership follows the existing domain-boundary documents; items grouped inside an existing page remain application-owned without inventing duplicate screens.

| Current location/item | Classification | Canonical target | Parent entitlement | Redirect | Contextual link |
| --- | --- | --- | --- | --- | --- |
| Header `Ledgerly` brand | GLOBAL (incorrect branding) | PracticeEngine suite header | none | n/a | Ledgerly identity moves to active app |
| Workspace/account actions | GLOBAL | suite header | none | no | app-independent |
| Inbox | GLOBAL | `/settings/notifications` | platform permission | `/inbox` when introduced | none |
| Workspace settings | GLOBAL | `/settings/organisation` | platform permission | `/settings` retained | none |
| Team | GLOBAL | `/settings/teams` | platform permission | `/team` when introduced | none |
| Practice overview | PRACTICE MANAGEMENT | `/practice/home` | `practice.enabled` | `/management` | Ledgerly where linked |
| Prospects | PRACTICE MANAGEMENT | `/practice/crm/prospects` | `practice.enabled` + `practice.crm` | `/crm/prospects` | none |
| Opportunities | PRACTICE MANAGEMENT | `/practice/crm/opportunities` | `practice.enabled` + `practice.crm` | `/crm/opportunities` | Open in QuoteBench |
| Onboarding | PRACTICE MANAGEMENT | `/practice/onboarding` | `practice.enabled` + `practice.onboarding` | `/onboarding` | none |
| Clients | PRACTICE MANAGEMENT | `/practice/clients` | `practice.enabled` | `/clients` | specialist apps for same client |
| Work | PRACTICE MANAGEMENT | `/practice/work` | `practice.enabled` | `/work` | Open in Ledgerly when linked |
| Review queue | PRACTICE MANAGEMENT | `/practice/review` | `practice.enabled` + workflow permission | no former path | none |
| Recurring work | PRACTICE MANAGEMENT | `/practice/recurring-work` | `practice.enabled` | no former path | Ledgerly only when linked |
| Generation operations | PRACTICE MANAGEMENT | `/practice/automation` | `practice.enabled` + orchestration entitlements | no former path | none |
| Client collaboration | PRACTICE MANAGEMENT | `/practice/collaboration` | `practice.enabled` + portal entitlements | no former path | none |
| Client portal | SHOULD NOT BE PRIMARY NAVIGATION | separate portal entry | portal entitlement/access | account-menu compatibility | none |
| Resources | PRACTICE MANAGEMENT | `/practice/resources` | `practice.enabled` + `practice.resources` | `/resources` | none |
| Capacity | PRACTICE MANAGEMENT | `/practice/capacity` | `practice.enabled` + `practice.capacity` | `/capacity` | none |
| Work allocation | PRACTICE MANAGEMENT | `/practice/work-allocation` | `practice.enabled` + `practice.capacity` | `/allocation` | none |
| Time | PRACTICE MANAGEMENT | `/practice/time` | `practice.enabled` + `practice.time` | `/time` | none |
| Portfolio | PRACTICE MANAGEMENT | `/practice/portfolio-economics` | `practice.enabled` + economics/reporting | `/portfolio` | none |
| Practice Management settings | PRACTICE MANAGEMENT | `/practice/settings/services` | `practice.enabled` + settings permission | state retained | none |
| Accounts production overview | LEDGERLY | `/ledgerly/overview` | `ledgerly.enabled` | `/`, `/engagement` | back to Practice work/client |
| Imports/trial balance | LEDGERLY | `/ledgerly/trial-balance` | `ledgerly.enabled` | `/trial-balance` | none |
| Mapping | LEDGERLY | `/ledgerly/mapping` | `ledgerly.enabled` | `/mapping` | none |
| Journals | LEDGERLY | `/ledgerly/journals` | `ledgerly.enabled` | `/journals` | none |
| Reconciliations | LEDGERLY | `/ledgerly/reconciliations` | `ledgerly.enabled` | `/reconciliations` | none |
| Tasks/technical review | LEDGERLY | engagement workspace | `ledgerly.enabled` | existing view retained | Practice review remains separate |
| Working papers | LEDGERLY | `/ledgerly/working-papers` | `ledgerly.enabled` | `/working-papers` | none |
| Disclosures | LEDGERLY | Accounts workspace | `ledgerly.enabled` | existing view retained | none |
| Accounts | LEDGERLY | `/ledgerly/accounts` | `ledgerly.enabled` | `/accounts` | none |
| Versions/history/artefacts | LEDGERLY | `/ledgerly/artefacts` | `ledgerly.enabled` | existing views retained | none |
| Filing/evidence | LEDGERLY | `/ledgerly/filing` | `ledgerly.enabled` | `/filing` | none |
| QuoteBench proposal/pricing | QUOTEBENCH | `/quotebench` or configured deployment | `quotebench.enabled` | integration link | from opportunity |
| Clarity IE | FUTURE CLARITY IE | `/clarity-ie` reserved | `clarity-ie.enabled` | none | not implemented |

Legacy redirects are client-side compatibility adapters and Cloudflare Pages continues to serve the SPA fallback. Canonical shell links use namespaced routes; old routes should not acquire new ownership.
