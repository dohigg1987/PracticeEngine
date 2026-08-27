# Verification strategy

Verification uses affected-area commands and three cumulative assurance levels.

| Gate | Command | Purpose |
| --- | --- | --- |
| Targeted | `verify:pm`, `verify:ledgerly`, `verify:api`, `verify:web`, `verify:security` | Smallest relevant subsystem feedback |
| Development | `npm run verify:fast` | Diff whitespace, architecture/lockstep/release guards, domain/API unit tests, API and web typechecks, web component tests |
| Integration | `npm run verify:integration` | Fast gate plus Worker build/Wrangler dry-run, UI/header guards, production-shaped web build and Practice Chromium smoke |
| Pilot/release | `npm run verify:pilot` | Authoritative domain/API/Worker/web regression and full Chromium plus locally installed Edge browser matrix |

The timing runners print total and per-suite seconds plus a machine-readable `VERIFY_TIMING_JSON` line. Development and integration use Chromium because these Practice journeys exercise browser-independent application behavior. The final pilot retains every journey against Chromium and locally installed Edge, preserving cross-browser assurance; no journey was removed.

The pilot runs browser coverage as isolated Playwright process shards. It defaults to two shards per detected browser (`PLAYWRIGHT_SHARDS_PER_BROWSER` can set another positive integer). On Windows with Edge installed this produces four jobs: Chromium 1/2, Chromium 2/2, Edge 1/2 and Edge 2/2. `PLAYWRIGHT_WORKERS` is the total process budget, default four, not a per-job value. A budget smaller than the number of browser-shard jobs is rejected. For a valid budget, each job receives `floor(total workers / total jobs)`, giving one worker per job in the four-job default and two workers per job in a Chromium-only run.

Jobs use isolated Vite port pairs: 51873/51874, 51883/51884, 51893/51894 and 51903/51904 in the four-job default. Test results and HTML reports are isolated under `apps/web/test-results/pilot/<browser>-<n>-of-<N>/{test-results,html-report}`. The orchestrator lets all jobs finish, reports every status and duration, aggregates browser wall-clock and nested job timings in `VERIFY_TIMING_JSON`, and fails if any shard fails. It supplies `CI=1` when absent, so the existing two-retry policy and retain-on-failure traces/videos apply. Retry counts remain part of the evidence and a retry-dependent result must be reported explicitly.

Process-level sharding avoids forcing several browser workers to share one Playwright server lifecycle. The runner executes at most two shard jobs concurrently by default, preventing four simultaneous Vite/browser stacks from exhausting a Windows desktop while retaining every browser and shard. `PLAYWRIGHT_BROWSER_JOB_CONCURRENCY` can set another positive bound. Each job has a 30-minute process-tree watchdog (`PLAYWRIGHT_BROWSER_JOB_TIMEOUT_MS`) so a stalled browser cannot leave the pilot alive indefinitely. Independent page contexts/demo state and unique servers, ports and artifact directories prevent shared fixture or output contention.

Test classification is an equivalent file/command taxonomy: Practice (`practice-management.spec.ts`, `verify:pm`), Ledgerly (`pilot.spec.ts`, `governed-working-papers.spec.ts`, `verify:ledgerly`), security/tenancy (API authorization/RLS contract tests and `verify:security`), browser compatibility (forced-colors, responsive accessibility and visual release files), and release-critical (the entire pilot). Database/RLS migration contracts remain in API tests and the guarded disposable-Neon gate validates real PostgreSQL behavior.

During implementation run the smallest targeted command, then the fast gate after a coherent increment, integration after database/API/Worker changes, and the full pilot once at final completion. Failed first attempts and reruns must be reported.

## PM-007 focused evidence

PM-007 adds a source contract for migration numbering, resource/member ownership, effective-dated patterns and rates, tenant-safe time/commercial relationships, forced RLS, least-privilege grants, permissions/entitlements and architecture value semantics. API tests cover deterministic daily/weekly/monthly capacity, part-time and adjustment behavior, committed versus recurrence forecast load, assignment validation/history, time association/permissions, historical rate snapshots, known/unknown economics and QuoteBench provenance.

Database assurance remains a distinct disposable-Neon run: apply migrations `0001` through `0035` to a fresh confirmed non-production branch, use two tenants and actors, and attempt read/write/cross-reference access for `resource_profile`, `resource_working_pattern`, `resource_availability_adjustment`, `work_assignment_history`, `resource_cost_rate`, `time_entry`, `work_commercial_context` and `billing_recovery`. Cost-rate/economics fixtures must prove the restricted policies, not only tenant filtering.

Browser evidence covers the resource list, capacity grid, allocation, time entry and portfolio/economic surfaces in Chromium during integration and in every configured Chromium/Edge pilot shard. Forced-colours is reported as first-pass or retry-dependent; retries are never hidden or increased to obtain a pass. UI-quality findings are recorded before/after and the checked-in ceiling must not increase.
