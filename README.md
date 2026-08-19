# Ledgerly accounts production

Ledgerly is a multi-tenant UK accounts-production workspace for controlled commercial pilots. It covers the engagement workflow from trial-balance import through mapping, adjustments, review, versioned accounts, evidence export and manual filing evidence.

## Implemented product

- Neon Auth sign-in, workspace onboarding and invitations
- Tenant-enforced Postgres row-level security and least-privilege runtime access
- Client and engagement setup
- CSV trial-balance import, source-account mapping and provenance
- Balanced journals with preparation, approval and posting controls
- Reconciliations, tasks and review points
- Versioned working papers and disclosures
- Reporting-pack selection and deterministic accounts versions
- Version-specific preparation, review, client, partner and filing sign-offs
- Authenticated HTML and native PDF accounts artefacts
- Deterministic evidence ZIP containing the manifest, readiness summary, sign-offs, audit trail and generated outputs
- Manual external filing evidence with immutable regulator-response records
- Hash-chained audit events and transactional outbox records

The interface uses Fluent UI and includes a development-only showcase with seeded charity accounts data. Showcase mode is removed from production builds.

## Local showcase

Use Node.js 22 or later. From `apps/web`:

```powershell
$env:VITE_DEMO_MODE='true'
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`. No authentication or external service is required in development showcase mode.

## Verification

Run the complete controlled-pilot gate with one command:

```powershell
npm run verify:pilot
```

After materialising `apps/api/wrangler.production.jsonc`, use `npm run verify:pilot -- --production` to reject placeholders and validate the real origins/bindings before deployment.

The individual checks are:

```powershell
npm run test:core
npm run test --workspace apps/api
npm run check --workspace apps/api
npm run typecheck --workspace apps/web
npm run test --workspace apps/web
npm run build --workspace apps/web
```

The API check includes a non-deploying Wrangler bundle. Database migrations and verification runbooks are under `packages/database`.

## Production pilot inputs

The product code does not contain production credentials or invent deployment domains. Before a live pilot, provide:

1. the controlled HTTPS web hostname;
2. the controlled HTTPS API hostname;
3. access to the Cloudflare account serving those hostnames;
4. a dedicated production R2 bucket;
5. the exact web origin in Neon Auth's trusted-origin configuration.

Follow `apps/api/PRODUCTION.md` for binding, dry-run, deployment and authenticated smoke checks. Do not reuse the development R2 bucket in production.

The acceptance definition for the current commercial-completion programme is
in `spec/COMMERCIAL_COMPLETION.md`. It separates features that can be verified
in code from accounting certification, provider credentials and operational
approvals that require an accountable external owner.

## Compliance boundary

The repository reporting packs are version-controlled baselines, not regulator-certified content. The pilot requires accounting-specialist review before accounts are relied on or submitted. iXBRL and direct regulator submission remain explicitly unavailable; filing screens record actions and evidence from external regulator portals without claiming to contact them.
