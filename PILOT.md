# Controlled commercial pilot

This runbook is the release gate for a supervised UK accounts-production pilot. It verifies representative workflow coverage; it is not evidence of unattended production readiness or direct regulator connectivity.

## Automated gate

From the repository root:

```powershell
npm install
npx playwright install chromium
npm run typecheck -w apps/web
npm test -w apps/web
npm run test:headers -w apps/web
npm run test:e2e -w apps/web
$env:VITE_NEON_AUTH_URL="https://your-public-neon-auth-url"
npm run build -w apps/web
```

The Playwright suite starts two isolated local Vite servers. Port `51873` uses DEV-only seeded showcase data; port `51874` verifies that a build without auth configuration fails closed with actionable guidance. Existing listeners are never reused, so another local project cannot satisfy the release gate accidentally. Showcase mode is disabled from production builds by the application guard. Chromium is always exercised; an installed Microsoft Edge channel is added automatically without downloading another browser engine. The suite includes a 390 px-wide navigation/source-data smoke.

## Supervised user acceptance

Use a non-production tenant and representative, non-personal trial balance.

1. Sign in through Neon Auth and select the assigned workspace. Confirm a user with no membership cannot enter tenant data.
2. Open Clients, create a legal entity, then create an engagement with the correct framework, sector and accounting period.
3. Import a balanced CSV trial balance. Confirm rejected files and malformed rows produce actionable errors without partial import.
4. Map every source account. Confirm the source-data total, mapping count and report remain balanced.
5. Create a balanced journal and exercise permitted preparation/approval transitions with separate users where segregation is required.
6. Create and review a reconciliation. Confirm an out-of-tolerance difference cannot be silently reviewed.
7. Complete representative tasks, review points, working papers and disclosures. Check immutable versions and active sign-offs after any content change.
8. Generate an accounts version from the applicable reporting pack. Review HTML and PDF artefacts, provenance, release checks and the evidence-bundle readiness result.
9. Download the evidence ZIP and inspect its manifest, sign-offs, audit trail and generated artefacts. Confirm no internal storage key, credential or token is present.
10. Prepare a filing attempt only from FINAL, filing-authorised accounts. Confirm the UI states that submission happens through an external regulator portal.
11. Record manual submission, then upload a representative regulator response. Confirm ACCEPTED marks the linked accounts version FILED and REJECTED does not.
12. As an OWNER/ADMIN, create a time-limited team invitation, copy the one-time fragment link, accept it as a second user, and revoke a separate unused invitation.

## Acceptance record

Record the build commit, tenant, engagement, tester roles, browser, start/end time, failures, evidence-bundle hash and the final go/no-go decision. Do not paste invitation tokens, JWTs, uploaded evidence contents or internal storage references into the record.

## Known pilot boundaries

- Filing screens record evidence for actions completed outside the product; they do not submit to regulators.
- Repository-baseline reporting packs are not described as regulator certified unless the API explicitly certifies them.
- The automated suite uses seeded DEV data. Authenticated cross-role segregation, real CSV upload, object-storage integrity and regulator-response evidence remain supervised acceptance steps.
- Browser automation covers Chromium and uses an already-installed Microsoft Edge channel when available. Add the organisation's supported WebKit matrix before a wider rollout.

## Production web hosting handoff

Do not deploy until the owner has chosen the Cloudflare account, Pages project name, production hostname and API hostname. `VITE_API_URL` and `VITE_NEON_AUTH_URL` are public browser configuration, not secrets, but they must point to the production services before Vite builds the immutable assets.

### Pages production-branch correction

Read-only Cloudflare discovery on 19 August 2026 found that production
deployments for `ledgerly-accounts` were labelled with branch
`codex/accounts-vertical-slice`, while the repository release branch is
`main`. Before the next production upload, change the Pages project's
production branch to `main` under **Settings > Builds & deployments > Branch
control**. The guarded release always supplies `--branch main` and the exact
Git SHA; if the remote project still treats another branch as production, the
upload will be only a preview and must not be promoted as a release.

Build from the repository root in a clean checkout:

```powershell
$env:VITE_API_URL="https://api.accounts.example"
$env:VITE_NEON_AUTH_URL="https://your-neon-auth-host/neondb/auth"
$env:WEB_ORIGIN="https://accounts.example"
$env:VITE_DEMO_MODE="false"
npm ci
npm run typecheck -w apps/web
npm test -w apps/web
npm run test:headers -w apps/web
npm run test:e2e -w apps/web
npm run build:production -w apps/web
```

Replace every `.example` value above with the selected real HTTPS production origin before running it. `build:production` fails before Vite runs if any origin is absent, non-HTTPS, local, credentialed, wildcarded or recognisably placeholder-based. It reduces API and Neon Auth URLs to exact origins and generates `apps/web/public/_headers`; that generated environment-specific file is ignored by Git and copied into `dist` by Vite. Run `npm run test:headers -w apps/web` to verify rejection rules and the generated policy contract.

Deploy output is `apps/web/dist`. For a Cloudflare Pages Direct Upload project,
authenticate to the selected account and create the project once. Subsequent
production builds and uploads must use the guarded root command so a dirty tree
cannot be published and Cloudflare records the exact Git SHA:

```powershell
npx wrangler login
npx wrangler pages project create
$env:WEB_ORIGIN="https://accounts.example"
$env:VITE_API_URL="https://api.accounts.example"
$env:VITE_NEON_AUTH_URL="https://your-neon-auth-host/neondb/auth"
$env:VITE_DEMO_MODE="false"
npm run release:check:web
npm run release:web
```

Use `--branch=<preview-name>` for a preview deployment. A Direct Upload project cannot later be converted to Git integration; choose Git integration at project creation if automatic repository builds are required. Equivalent static hosts must serve `index.html` for unknown application routes, retain URL fragments, use HTTPS and never rewrite `/v1/*` to the SPA when the API shares the hostname.

Cloudflare Pages treats a deployment without a top-level `404.html` as an SPA and falls unknown paths back to `/`. Keep that behavior so `/invite#token=…` loads the React application; the fragment must never reach server logs or referrer headers.

The generated `_headers` applies `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, HSTS, a restrictive `Permissions-Policy`, and a CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `connect-src` limited to `'self'`, the exact API origin and exact Neon Auth origin. Fluent UI injects styles at runtime, so the generated policy retains `style-src 'unsafe-inline'`; test a nonce- or hash-based replacement before tightening it. Fingerprinted `/assets/*` receive `public, max-age=31536000, immutable`, while `index.html` receives `no-cache`. Do not add a blanket Cloudflare cache rule over HTML because it can serve a stale entry point after release.

Post-deploy smoke checks:

1. Open the custom HTTPS hostname and confirm no showcase badge or demo data is present.
2. Deep-link to `/invite#token=invalid-test-token`; confirm the SPA loads and the token remains only in the fragment, then remove it from browser history.
3. Sign in and sign out through Neon Auth. Confirm the production web origin is in Neon Auth's trusted-origin configuration and that cookies/session requests are not using the DEV `/neon-auth` proxy.
4. Select a permitted tenant and inspect one API request: it must target `VITE_API_URL`, carry `Authorization: Bearer …` and `x-tenant-id`, and must not contain an actor-ID header.
5. Verify an unauthenticated API request returns `401`, an unassigned tenant returns `403`, a browser refresh on an application route returns the SPA, and static assets return the intended cache/security headers.
6. Exercise authenticated HTML/PDF/evidence-bundle download once. Confirm blob downloads work without exposing a storage key or opening an unauthenticated object URL.
