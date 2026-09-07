# Ledgerly Google sign-in recovery

The observed production Pages release is `c8f37ead059ffda6b68c2c182f8a9836e20bdb1e`. Current main is twelve commits ahead and includes platform/API/database changes. This branch applies only authentication recovery and its checks to that exact live source.

The affected password identity is not linked to Google and its email is unverified. The app now displays OAuth errors, offers managed email verification using a code, and retries Google's normal social sign-in after the service confirms verification. It does not call linkSocial through the proxy: Neon SDK issue #181 reports a state-cookie problem on that route. Normal social sign-in uses Neon's hosted init handoff. Verification does not override provider linking policy; a real owner-authenticated Google sign-in remains the final acceptance check.

The first-party callback endpoint exchanges the single-use verifier and accepts success only with a usable HttpOnly session cookie. No authentication records are edited directly, no verification/state checks are bypassed, and no API/database/tenant changes are deployed.

The specialized hotfix guard permits only the named release branch descended from the recorded live SHA, an exact clean tracking commit, an explicit file allowlist, the existing production origin/configuration validators, and unchanged live production immediately before publishing. The normal main release guard remains untouched. The workflow publishes only after merging this reviewed patch into release/ledgerly-google-auth and passing its checks. It uses the existing Cloudflare repository connection.

Rollback: promote the previous successful Pages deployment (b7241b84) if the auth screen or callback fails. Do not undo legitimate email verification or provider links subsequently completed by users.

Sources:
- https://neon.com/docs/auth/guides/email-verification
- https://better-auth.com/docs/reference/errors/account_not_linked
- https://github.com/neondatabase/neon-js/issues/181
