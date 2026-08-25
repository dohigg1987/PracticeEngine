# Accounting domain instructions

- This package is the existing Ledgerly accounting domain, not a generic dumping ground for future Platform Core code.
- Preserve balanced-money, versioning, sign-off, filing and evidence invariants.
- Keep domain logic deterministic and infrastructure-independent where it already is.
- New shared Platform/Practice concepts belong behind explicit contracts in their owning modules; add compatibility adapters rather than widening accounting types silently.
- Run `npm run test:core` for changes here.
