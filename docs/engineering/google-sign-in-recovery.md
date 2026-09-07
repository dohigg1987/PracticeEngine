# Google sign-in recovery

The production fix is delivered in PR #20 from the observed live commit `c8f37ead059ffda6b68c2c182f8a9836e20bdb1e`. This PR carries the same authentication behavior forward onto main; it does not deploy the unreleased platform commits.

An existing password account can return from Google with `account_not_linked`. The app now displays actionable recovery, opens a Fluent v9 Sign-in methods dialog after password login, and verifies email ownership with managed Neon OTP before using normal Google sign-in. Success is shown only after a fresh provider-account read confirms Google is connected. It does not use `linkSocial` through the same-origin proxy, the pattern reported in [Neon SDK issue 181](https://github.com/neondatabase/neon-js/issues/181).

The callback endpoint exchanges a verifier once, removes it from browser history, and requires the managed provider to issue a usable session cookie. Email ownership, OAuth state, identity, tenant membership and authorization remain managed by their existing services. No Auth-table writes or manual links are used.

Verification covers wrong and accepted OTPs, server-confirmed verification, mobile and desktop layout/accessibility, list retry, keyboard dismissal, callback completion, unknown error codes, cancellation and mismatched account recovery. Browser fixtures use synthetic accounts and cannot establish that the real owner's Google account has completed sign-in.

After deployment, the owner can sign in with the existing password, verify email in Sign-in methods, continue with the Google account using the same email, then sign out and sign in with Google again. If account linking is still refused after email verification, investigate the managed provider policy without weakening it.
