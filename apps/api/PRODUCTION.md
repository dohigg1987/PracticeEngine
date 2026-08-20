# API production promotion

An exact custom domain remains the preferred production route. The owner has
temporarily approved only
`https://uk-accounts-api-production.dennis-ohiggins.workers.dev` while that
domain is being arranged. Never bind production to `uk-accounts-dev-artefacts`.

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

### Temporary approved workers.dev route

The committed production config may temporarily retain `workers_dev: true` with
no routes only for the exact `uk-accounts-api-production` Worker, the exact
`https://ledgerly-accounts.pages.dev` web origin, the provisioned Neon Auth
service, `preview_urls: false`, and the reviewed production R2 and Hyperdrive
bindings. Any other Worker name, route, origin or binding fails the release
guard. Replace this temporary topology with the controlled custom-domain config
above as soon as the hostname is available.

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

The template check validates the custom-domain placeholder template. Production
verification accepts either that fully materialised custom-domain topology or
the single temporary workers.dev topology above; both require the production
bucket, reviewed Hyperdrive binding, disabled preview URLs and observability.

## Deploy and read-only smoke test

Only after the checks above succeed, use the guarded root command. It refuses a
dirty worktree, a non-`main` release, a commit that differs from the locally
known `origin/main`, or an invalid production configuration. Wrangler receives
the exact Git SHA as both the version tag and deployment message.

```powershell
npm run release:check:api
npm run release:api
```

Do not call `wrangler deploy` directly for a production release.

Set the deployed API origin and a short-lived pilot user's Neon Auth token in
process environment variables. The verification script refuses non-HTTPS URLs,
paths, redirects, or a hostname that differs from the configured production
Worker origin.
It does not write application or Cloudflare data.

```powershell
$env:PILOT_API_BASE = "https://uk-accounts-api-production.dennis-ohiggins.workers.dev" # or the configured controlled API host
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
