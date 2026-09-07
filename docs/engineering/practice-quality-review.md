# PracticeEngine implementation quality review

Reviewed main at a288e35 and the newer development line at df70cc8. Implementation targets environment/dev-integrated to preserve its existing navigation, client workspace and CRM improvements. The historical platform/modular-practice-foundation branch is no longer present.

## Fixed in this change

- Full work details existed only in React state. Refresh, browser history and navigation to Review could display a different screen from the URL. Work details now use the work query parameter, preserve queue filters and selection, and reset by tenant and work identity.
- A failed work selection retained the previous inspector's actionable record. Selection loads now clear stale details, report missing records separately, and reject superseded responses. Client delivery also checks the selected work belongs to the displayed client.
- Due soon included completed/cancelled work and past dates. It now contains only unfinished work between today and the seven-day horizon.
- My work actually meant any assigned work. The label is now Assigned work; All work is the default. Personal filtering requires an authenticated tenant-member identity contract.
- Add work in the queue navigated to a client list. A shared Fluent dialog now creates work in place, supports client/service selection, and opens the created record. Engagement selection is explicit; the previous client dialog silently chose the first active engagement.
- Saved views and command bars imitated tabs/toolbars with custom buttons/divs. They now use Fluent TabList/Tab and Toolbar/ToolbarGroup. Grid links retain modified-click behavior and avoid an extra focus stop.
- Mobile navigation used an inline drawer positioned by CSS. It now uses Fluent overlay mode with dismissal, focus containment and an accessible close control.
- Changing a Ledgerly engagement did not update the URL; moving between Ledgerly screens discarded deep-link context. Both now preserve the selected client and engagement.
- Resource-list failure prevented work from loading. Assignment options now fail independently with retry while the work queue remains usable.
- The client workspace Details area had replaced the working permanent file with a read-only summary. It now exposes the existing permanent-file editor within the client workspace. The regression test follows Services, Delivery and Details in the current navigation.
- Home deadline links now retain the intended calendar-week boundary, and editing a filter replaces its history entry instead of adding a browser Back stop for every character.
- The remote quality workflow did not compile a production web build or run the Fluent/header guards. Those checks now accompany the existing fast and browser gates.

## Remaining implementation gaps

- UI smoke tests rely heavily on development showcase data. They do not prove authenticated production behavior, real database permissions, cross-tenant denial, outbox delivery or live portal recipient access.
- Client requests from the work inspector use legacy portal-contact identifiers as recipientAccessIds. The new collaboration endpoint expects scoped access records; this needs a verified API adapter and authenticated integration fixture before that workflow can be considered complete.
- Review and workflow commands still supply generic blocker/change-request reasons instead of collecting specific evidence from the user.
- Template and automation configuration is shallow: publishing/toggling existing records is present, but complete authoring and validation journeys need further work.
- Global CSS debt remains outside the changed component patterns. Existing open PRs #2 and #11 should be assessed against this development head before integration.

## Verification and release

GitHub Actions is authoritative for this change. See the pull request checks for exact attempts, failures and results; source inspection is not a substitute for executed evidence. No live database or regulator service was used. The earlier main baseline domain/API suites passed before work switched to GitHub-only execution.

All capabilities remain owned by Practice Management or their existing suite/Ledgerly owners. Existing server commands continue enforcing tenancy, authorization, entitlements and audit. There are no schema, production-data or deployment changes. Rollback is a revert of this pull request.

### Executed attempts

- The first remote build (a0580d0) passed strict checks, 141 web tests, 184 API tests, the Fluent/header guards and a production build. Its browser run was superseded by the permanent-file correction.
- At 1f6447e, the 21-surface accessibility audit passed. The focused browser suite passed refresh/history, tab keyboard selection, missing-record handling and capture, and exposed a required-field locator mismatch plus the overlay drawer's inherited navigation role. These are corrected in the next revision. Existing Practice tests also used obsolete DOM value selectors; they now select the visible navigation controls.
- The final-verification workflow runs the repository's exact `verify` and `verify:pilot` commands remotely, in addition to the diagnostic quality jobs. It is triggered by this review document or manually for future release reviews; the normal quality workflow still covers every pull request.

- Remote screenshots exposed invisible neutral badges: Fluent's outline/subtle combination uses an inverted foreground. The shared treatment now uses outline/informative, with a browser contrast regression. The mobile dismissal test also exposed missing restore-focus attributes; the navigation button and drawer now use Fluent's public restore-focus hooks.
- The broader browser run found a pre-existing Home test tied to the removed Attention required panel and Deadline select. It now exercises the current priority grid, capacity/economics links and opening work. Home's inspector also clears selection before loading, checks the selected work identity and resets on tenant changes.
- Mobile focus restoration and neutral badge contrast passed on 2957039. The subsequent scan found a transient restored-focus tooltip outside page landmarks; tests now dismiss it through its normal Escape behavior before the page audit. Creation dialogs also declare their Fluent focus source and return target, with an Escape regression test.
