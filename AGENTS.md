# Ledgerly UI implementation requirements

These requirements apply to every change under `apps/web`.

## Fluent UI is the default

- Use official Fluent UI React v9 components and tokens before writing bespoke controls or visual treatments.
- Do not create custom elements that merely resemble a Fluent button, link, field, dialog, table, menu, tab, badge, message bar, accordion, or navigation item.
- The same action must use the same component, label, size, and appearance wherever it appears in the same workflow.
- Text actions must be visibly interactive. Use `Button` for commands and `Link` for navigation; never style an action as unadorned body text.

## Hierarchy and density

- Use at most one primary action in a page header or form action group. Use secondary, subtle, or transparent actions according to Fluent guidance.
- Default to compact application density: small row actions, standard 32px controls, restrained page headers, and concise supporting text.
- Avoid large empty panels, repeated explanatory copy, decorative cards, rounded pills, gradients, marketing language, and ornamental status colours.
- Do not expose internal IDs, hashes, storage keys, renderer versions, environment variables, or infrastructure terminology in normal user workflows.

## Navigation and layout

- Practice, accounts-production stages, and administration use one consistent accordion/header geometry.
- All sidebar destination rows use the same icon size, text size, padding, and vertical alignment.
- Client records drill into a permanent file; annual engagements drill into accounts production.
- Preserve keyboard navigation, focus visibility, accessible names, and responsive overflow.

## Required verification

- Visually inspect every touched screen at desktop and narrow/mobile widths in the live app.
- Compare repeated components side by side; do not accept different rendering for the same semantic action.
- Run strict TypeScript, unit tests, relevant Playwright journeys, and the production build before handoff.
- A change is not complete if it merely compiles but remains visually inconsistent with Fluent UI.
