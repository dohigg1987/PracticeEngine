# Verification strategy

Verification uses affected-area commands and three cumulative assurance levels.

| Gate | Command | Purpose |
| --- | --- | --- |
| Targeted | `verify:pm`, `verify:ledgerly`, `verify:api`, `verify:web`, `verify:security` | Smallest relevant subsystem feedback |
| Development | `npm run verify:fast` | Diff whitespace, architecture/lockstep/release guards, domain/API unit tests, API and web typechecks, web component tests |
| Integration | `npm run verify:integration` | Fast gate plus Worker build/Wrangler dry-run, UI/header guards, production-shaped web build and Practice Chromium smoke |
| Pilot/release | `npm run verify:pilot` | Authoritative domain/API/Worker/web regression and full Chromium plus locally installed Edge browser matrix |

The timing runners print total and per-suite seconds plus a machine-readable `VERIFY_TIMING_JSON` line. Browser tests use independent Playwright contexts and in-page demo state, so files and tests can safely run with four workers. Development and integration use Chromium because these Practice journeys exercise browser-independent application behavior. The final pilot retains every journey against Chromium and Edge, preserving cross-browser assurance; no journey was removed.

Test classification is an equivalent file/command taxonomy: Practice (`practice-management.spec.ts`, `verify:pm`), Ledgerly (`pilot.spec.ts`, `governed-working-papers.spec.ts`, `verify:ledgerly`), security/tenancy (API authorization/RLS contract tests and `verify:security`), browser compatibility (forced-colors, responsive accessibility and visual release files), and release-critical (the entire pilot). Database/RLS migration contracts remain in API tests and the guarded disposable-Neon gate validates real PostgreSQL behavior.

During implementation run the smallest targeted command, then the fast gate after a coherent increment, integration after database/API/Worker changes, and the full pilot once at final completion. Failed first attempts and reruns must be reported.
