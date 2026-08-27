# Application manifests

`apps/web/src/application-manifests.ts` is the authoritative UI registry for PracticeEngine applications. Each entry declares its stable ID, display and short names, icon key, route prefix, parent entitlement, home route, availability status, navigation, settings and contextual actions. Application navigation must not be repeated in shell components.

| ID | Route prefix | Entitlement | Status |
| --- | --- | --- | --- |
| `practice` | `/practice` | `practice.enabled` | implemented |
| `ledgerly` | `/ledgerly` | `ledgerly.enabled` | implemented |
| `quotebench` | `/quotebench` | `quotebench.enabled` | integration boundary |
| `clarity-ie` | `/clarity-ie` | `clarity-ie.enabled` | future registration; not implemented or launcher-visible |

QuoteBench uses `VITE_QUOTEBENCH_URL` when its deployment boundary is configured. Without that value, its entitled route shows an integration-boundary state; PracticeEngine does not reproduce proposal composition or pricing.

Manifest tests require unique route ownership, prevent Practice/Ledgerly navigation contamination, verify entitlement filtering and exercise namespace/deep-link resolution. The architecture verifier parses shell JSX and rejects direct declarations of specialist navigation in `App.tsx`.
