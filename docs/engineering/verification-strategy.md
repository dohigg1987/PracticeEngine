# Verification strategy

Verification uses affected-area commands and three cumulative assurance levels.

| Gate | Command | Purpose |
| --- | --- | --- |
| Targeted | `verify:pm`, `verify:ledgerly`, `verify:api`, `verify:web`, `verify:security` | Smallest relevant subsystem feedback |
| Development | `npm run verify:fast` | Diff whitespace, architecture/lockstep/release guards, domain/API unit tests, API and web typechecks, web component tests |
| Integration | `npm run verify:integration` | Fast gate plus Worker build/Wrangler dry-run, UI/header guards, production-shaped web build and Practice Chromium smoke |
| Pilot/release | `npm run verify:pilot` | Authoritative domain/API/Worker/web regression and full Chromium plus locally installed Edge browser matrix |

The timing runners print total and per-suite seconds plus a machine-readable `VERIFY_TIMING_JSON` line. Development and integration use Chromium because these Practice journeys exercise browser-independent application behavior. The final pilot retains every journey against Chromium and locally installed Edge, preserving cross-browser assurance; no journey was removed.

The pilot runs browser coverage as isolated Playwright process shards. It defaults to two shards per detected browser (`PLAYWRIGHT_SHARDS_PER_BROWSER` can set another positive integer). On Windows with Edge installed this produces four concurrent jobs: Chromium 1/2, Chromium 2/2, Edge 1/2 and Edge 2/2. `PLAYWRIGHT_WORKERS` is the total process budget, default four, not a per-job value. A budget smaller than the number of browser-shard jobs is rejected. For a valid budget, each job receives `floor(total workers / total jobs)`, giving one worker per job in the four-job default and two workers per job in a Chromium-only run.

Jobs use isolated Vite port pairs: 51873/51874, 51883/51884, 51893/51894 and 51903/51904 in the four-job default. Test results and HTML reports are isolated under `apps/web/test-results/pilot/<browser>-<n>-of-<N>/{test-results,html-report}`. The orchestrator lets all jobs finish, reports every status and duration, aggregates browser wall-clock and nested job timings in `VERIFY_TIMING_JSON`, and fails if any shard fails. It supplies `CI=1` when absent, so the existing two-retry policy and retain-on-failure traces/videos apply. Retry counts remain part of the evidence and a retry-dependent result must be reported explicitly.

Process-level sharding avoids forcing several browser workers to share one Playwright server lifecycle while still bounding total browser concurrency. Independent page contexts/demo state and unique servers, ports and artifact directories prevent shared fixture or output contention.

Test classification is an equivalent file/command taxonomy: Practice (`practice-management.spec.ts`, `verify:pm`), Ledgerly (`pilot.spec.ts`, `governed-working-papers.spec.ts`, `verify:ledgerly`), security/tenancy (API authorization/RLS contract tests and `verify:security`), browser compatibility (forced-colors, responsive accessibility and visual release files), and release-critical (the entire pilot). Database/RLS migration contracts remain in API tests and the guarded disposable-Neon gate validates real PostgreSQL behavior.

During implementation run the smallest targeted command, then the fast gate after a coherent increment, integration after database/API/Worker changes, and the full pilot once at final completion. Failed first attempts and reruns must be reported.
