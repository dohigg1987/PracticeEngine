# Google sign-in recovery

## Failure and scope

Production returned `?error=account_not_linked` after Google authentication. A read-only inspection confirmed that the affected existing identity has password sign-in and no Google link; its email is not verified. The production origin is trusted and Google is enabled. The Google account chooser was reached through the live sign-in button. Completing the user's Google/password authentication requires the user; no credentials were collected or changed.

The app ignored OAuth error query parameters and offered no authenticated account-linking action. Production main also lacks the social-verifier completion endpoint already present on the development branch. This focused hotfix targets current main (the exact deployed production SHA has not been established) in a separate branch so it can be reviewed independently of PR #17. The historical platform branch is no longer present. Production main and legacy history are unchanged.

## Changes

Platform Core owns personal identity and sign-in methods. The account menu now exposes a Fluent dialog using the managed Auth service's `listAccounts` and authenticated `linkSocial` methods. Following an unlinked-account error, signing in with the existing password opens the dialog. Users explicitly select Connect Google; the provider continues enforcing identity matching and linking policy.

Known OAuth errors receive fixed, actionable messages. Arbitrary error descriptions are never reflected. Error query values are removed from browser history while route context and callback verification are retained.

The existing development callback exchange is included for production. It removes the single-use verifier from the URL, exchanges it once through the same-origin Pages endpoint, and restores the authenticated session only after completion. The endpoint requires same-origin JSON, rejects missing/invalid proof, strips POST body headers from the subsequent GET, and reports success only if Auth issues a usable HttpOnly session cookie. Environment-specific Auth routing preserves production defaults and fails closed for a development deployment with no Auth URL.

## Security and ownership

No direct authentication-table writes, forced account merges, email-verification overrides, credential changes, permission changes, or tenant-data changes are made. Linking is handled by the managed identity service using an authenticated session and provider confirmation. Application authorization, entitlements, tenant membership and business audit commands remain unchanged. This feature adds an account-menu utility, not application primary navigation.

Production currently uses Neon's shared Google credentials; the provider recommends application-owned OAuth credentials for production. That separate configuration work needs the owner's Google OAuth application and does not justify bypassing account-linking checks.

## Verification and release

GitHub Actions runs focused auth unit tests, callback/proxy tests and eight browser recovery scenarios, including 320/390px reflow and accessibility. Browser authentication responses are mocked deliberately; they verify the app's recovery contract without impersonating a user or contacting production. The exact `verify:integration`, `verify` and `verify:pilot` commands run remotely too. See PR checks for actual results and retries.

After deployment, the owner must verify: sign in with the existing method, open Sign-in methods, connect the Google account with the same email, confirm connected status, sign out, and use Continue with Google. Cancelled/mismatched-account callbacks must retain a recoverable UI. Verify the user identity and existing workspace are unchanged. Do not mark the live flow fixed solely because mock tests pass.

No deployment is performed by this workflow. Rollback is a revert of this PR and a guarded web release; it does not remove legitimate sign-in links a user has subsequently created.

## Sources

- [Better Auth account_not_linked](https://better-auth.com/docs/reference/errors/account_not_linked)
- [Better Auth explicit account linking](https://better-auth.com/docs/concepts/users-accounts#manually-linking-accounts)
- [Neon OAuth setup](https://neon.com/docs/auth/guides/setup-oauth)

## Executed attempts

The first remote strict typecheck and focused auth/callback unit tests passed. The full web unit suite exposed an import-time interaction with an existing shallow Fluent mock in unrelated App helper tests. The personal sign-in dialog now loads on demand, matching the existing workspace loading pattern and keeping it out of the initial application bundle. Full verification is rerun after the correction.

The first browser attempt confirmed safe error handling and callback completion. Recovery form tests needed to match Fluent required-field accessible names (including their required marker). Retry also exposed lost keyboard focus when its button was removed during loading; focus now moves to the persistent Close action before retrying, keeping Escape dismissal available. All recovery scenarios are rerun without removing assertions.

The second browser run passed verifier completion, error fallback, and Retry/Escape. The three recovery widths exposed existing low-contrast setup guidance outside the dialog. That setup paragraph now uses the public Fluent neutral foreground token. Cancelled and mismatched account callbacks also have explicit error destinations and regression coverage.

## Release blocker: managed provider behavior

Keep this change in draft until a real authenticated Google link through the deployed proxy succeeds. [Neon SDK issue #181](https://github.com/neondatabase/neon-js/issues/181) reports that `linkSocial` through a same-origin proxy returns a provider URL without the init handoff used by `signIn.social`; the state cookie then lives on the application domain but the provider callback arrives at Neon, causing `state_mismatch`. The report remains open and has no maintainer resolution. It was reported against an earlier SDK version, so it establishes a material deployment risk rather than proof of the current service's behavior.

The read-only managed configuration does not expose account-linking policy. Do not claim email verification alone guarantees resolution, or that passing mocked browser tests proves live Google linking. Do not disable state checks, force-link accounts, or transfer cookies across domains to work around this limitation. The provider behavior must be validated with the owner's authenticated session in an authorized release environment, or resolved by the provider before production release.

The third run passed the full quality workflow and all 143 pilot browser journeys. The separate unsharded `verify` invocation hit 30-second timeouts in two existing long pilot journeys under four browser workers; it is rerun with one worker, preserving the same command and assertions. Focused recovery assertions were reached during full-page redirects; these now allow 15 seconds for session restoration and include synthetic-account page diagnostics on failure. This remains a test hypothesis until the rerun confirms it.
