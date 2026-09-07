# PracticeEngine delivery foundations review

This increment targets `environment/dev-integrated` and https://practiceengine-dev.pages.dev. Practice Management owns the changed capabilities; existing suite and Ledgerly boundaries remain intact.

## Problems and resulting behavior

The work queue previously opened competing detail surfaces, while review buttons could change a work status without creating an operational review. The new delivery record connects tasks, workflow and reviews, presents the next available action, and requires actual review targets and reviewers. Review points can be addressed, cleared or reopened. Rescheduling and requested changes collect the operator's reason.

The server now returns flat review records, validates that a review target belongs to the same work and tenant, rejects duplicate active reviews, and updates the work status and review with their audit events in one transaction. Mandatory unfinished tasks block completion. Closed work rejects new tasks and reviews. Existing permission and override checks remain authoritative.

Client service activation is reachable from Services and Add work. Client requests select canonical portal client-access records, including client-wide recipients without an engagement. Requests, access records and messages load independently. Home can show delivery work when secondary financial or capacity data fails.

Fluent React v9 dialogs, fields, tabs, tables and semantic tokens provide the interaction primitives. The record reflows at 320px; touch targets and keyboard focus are covered by browser checks. Earlier queue URL/history, missing-record, navigation, focus and contrast corrections remain intact.

## Executed evidence and limits

At 9df3483, the remote non-browser checks and web build passed, the focused work/delivery browser job passed, and the 21-surface accessibility job passed. The complete task → review point → approval → completion journey, client service activation, portal recipient selection and deadline reasons were exercised.

Actual route-handler tests use a controlled transaction adapter to test mandatory task completion gates, override permission, closed work, cross-work review targets, duplicate reviews, transactional audit writes and flat review DTOs. These do not claim live database/RLS coverage. Browser journeys use showcase fixtures and do not prove authenticated live behavior, real outbox delivery or portal authorization. The exact final `verify` and `verify:pilot` commands run in GitHub Actions; the PR checks are authoritative for the final revision.

## Release

The live DEV website had advanced while its backend remained on 6fe19a0. The existing GitHub Cloudflare credential can publish Pages but returned 403 for Worker metadata. The existing authorised Wrangler session successfully verified the actual DEV origin, R2 and Hyperdrive bindings.

GitHub now retains the compiled DEV Worker artifact for the source commit. Backend publication must use that artifact, preserve existing bindings and secrets, and set APP_VERSION to the release commit. Website publication waits for that exact backend version and readiness; it fails instead of publishing against an older backend. Automated Worker publication still requires the existing CI credential to receive Worker deployment scope; the website gate does not grant that scope.

No checkout, dependency install, build output or new temporary files were created on the user's computer. Source edits and tests run in GitHub; remote artifacts can be handled in memory for publication. No database migration is part of this increment. Rollback requires reverting the change and publishing the corresponding backend before its website.

## Remaining work

- Authenticated live acceptance across real roles, tenant boundaries and scoped portal recipients remains separate from fixture coverage.
- Client request recipient listing currently follows the server's portal-access permission contract; request-only roles may need a dedicated, appropriately authorised recipient endpoint.
- Template/automation authoring and validation remain shallow.
- Global styling and broader information architecture outside the delivery journey need further work.
