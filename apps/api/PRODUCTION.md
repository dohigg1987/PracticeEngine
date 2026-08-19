# API production promotion

Production deployment is intentionally blocked until Cloudflare authentication, a
controlled API hostname, and the exact HTTPS web origin are available. Never bind
production to `uk-accounts-dev-artefacts`.

## One-time Cloudflare preparation

From the repository root:

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler r2 bucket list
npx wrangler hyperdrive list
npx wrangler deployments list --name uk-accounts-api-production
npx wrangler r2 bucket create uk-accounts-prod-artefacts
npx wrangler r2 bucket info uk-accounts-prod-artefacts
npx wrangler hyperdrive get a07d1364c5c74e558ef127d515cdce92
```

Confirm the Hyperdrive origin uses the production Neon database role whose schema
contains migrations `0001` through `0017`, including the `accounts_app` grants.

## Materialise the production config

1. Copy `apps/api/wrangler.production.example.jsonc` to
   `apps/api/wrangler.production.jsonc`.
2. Replace `<CONTROLLED_API_HOST>` with the controlled hostname, for example
   `api.accounts.example.com`.
3. Replace `<EXACT_HTTPS_WEB_ORIGIN>` with the deployed browser origin, with no
   path and no trailing slash, for example `https://accounts.example.com`.
4. Set the web deployment's `VITE_API_URL` to `https://<CONTROLLED_API_HOST>` and
   its `VITE_NEON_AUTH_URL` to the same public Neon Auth URL in the API config.
5. Keep `workers_dev` and `preview_urls` false. Do not deploy until the custom
   domain is controlled by the same Cloudflare account. Wrangler has no
   read-only route-list command; verify the hostname under the Worker's
   **Settings > Domains & Routes** before the first deploy.

The config contains no secrets. Hyperdrive owns the database credential and the
Neon Auth URL is public configuration.

## Non-deploying checks

```powershell
npm run test --workspace apps/api
npm run check --workspace apps/api
npm run verify:production-template --workspace apps/api
npm run verify:production --workspace apps/api
npx wrangler types --config apps/api/wrangler.production.jsonc --check
npx wrangler deploy --config apps/api/wrangler.production.jsonc --dry-run --outdir apps/api/.wrangler/production-dry-run
```

Inspect the dry-run binding table. It must show the production Worker name, the
production R2 bucket, the expected Hyperdrive ID, the exact web origin, and the
public Neon Auth URL.

The template check validates the committed placeholder template. The production
verification command intentionally fails until the materialised config has no
placeholder domain/origin, uses the production bucket, disables all Cloudflare
preview URLs, and retains observability.

## Deploy and read-only smoke test

Only after the checks above succeed:

```powershell
npx wrangler deploy --config apps/api/wrangler.production.jsonc
```

Set the deployed API origin and a short-lived pilot user's Neon Auth token in
process environment variables. The verification script refuses non-HTTPS URLs,
paths, redirects, or a hostname that differs from the configured custom domain.
It does not write application or Cloudflare data.

```powershell
$env:PILOT_API_BASE = "https://<CONTROLLED_API_HOST>"
$env:PILOT_ACCESS_TOKEN = "<SHORT_LIVED_NEON_AUTH_ACCESS_TOKEN>"
npm run verify:production --workspace apps/api -- --remote
Remove-Item Env:PILOT_ACCESS_TOKEN
```

The remote check verifies public liveness (`/health`), dependency readiness
(`/ready`, including Hyperdrive/Postgres and R2), exact-origin CORS preflight,
authenticated tenant discovery, rejection of untrusted-origin CORS, absence of
redirects, and correlation IDs. It never creates a workspace or other business
record.

After deployment, confirm Workers Logs contain structured `http_request` events
with `correlationId`, method, path, status and duration, and use:

```powershell
npx wrangler tail uk-accounts-api-production --format json
```

Do not include access tokens, request bodies, R2 keys or database connection
strings in logs or support exports.
