# Web application instructions

- Follow `docs/design/DESIGN-CONSTITUTION.md` and `docs/design/ANTI-PATTERNS.md`.
- Use public Fluent UI React v9 components and semantic tokens before bespoke UI. Preserve approved component recipes and compact operational density.
- Keep API authorization and entitlements server-enforced; browser visibility is presentation only.
- Do not expose internal IDs, storage keys, hashes or infrastructure details in normal workflows.
- Verify touched surfaces at desktop and 390/320px where relevant, keyboard/focus, forced colours, accessibility and long/error/empty states.
- Run strict typecheck, focused Vitest/Playwright, UI quality guard and production build for material UI changes.
