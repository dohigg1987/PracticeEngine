# Fluent application design constitution

## Authority

Fluent UI React v9 is the application design system, not visual inspiration. Reuse an approved Ledgerly pattern first, then a public Fluent component, and introduce bespoke presentation only when neither represents the required domain interaction.

## Components and tokens

- Use public `@fluentui/react-components` v9 components before custom controls.
- Use Fluent semantic tokens for colour, typography, spacing, stroke, radius, shadow, motion and focus.
- Do not target generated `.fui-*` classes or implementation attributes.
- Use Fluent System Icons; do not use emoji as application icons.
- Keep native file inputs only as hidden plumbing behind an accessible Fluent trigger and field.
- Preserve native document semantics for generated/statutory output where they are the content, not application chrome.

## Information hierarchy

- Default operational content to left alignment.
- Establish hierarchy with typography, spacing and neutral dividers before adding containers.
- Keep page headings restrained and task-oriented.
- Use cards only for genuinely discrete content objects or floating hierarchy, not every page section.
- Use tables/DataGrid for structured operational data; use lists for simple sequences and Accordion for meaningful progressive disclosure.
- Prefer compact enterprise density: standard 32px controls, small row commands, concise labels and predictable alignment.
- Explanatory text earns its place by resolving ambiguity, consequences or next action.

## Colour and elevation

- Use neutral surfaces for most application chrome.
- Use brand colour selectively for interaction, current selection and meaningful emphasis.
- Status colour always accompanies text/icon/structure; colour is never the only signal.
- Use elevation only for floating UI or a real hierarchy transition such as menus, dialogs and popovers.
- Do not add decorative shadows, glows, gradients or arbitrary colour families.

## Actions and feedback

- Provide at most one primary action in a page header or form action group.
- Use consistent labels, component, size and appearance for the same action in the same workflow.
- Use `Button` for commands and `Link` for navigation.
- Use `Field` validation for control-specific guidance, `MessageBar` for contextual section/page feedback, Toast for transient completion, and Dialog for blocking decisions.
- Scope transient feedback to the action's originating view/resource so it cannot leak across navigation.
- Disabled controls must have understandable prerequisites nearby; do not use an alarming page-wide warning for ordinary incomplete setup.

## Accessibility and responsive behaviour

- Preserve semantic names, keyboard order, focus trapping/restoration, focus visibility and high-contrast boundaries.
- Meet WCAG 2.2 AA and test with automated tooling plus manual assistive-technology review for release-critical workflows.
- Support reflow at 320 CSS pixels, 200% text spacing and the product's narrow/mobile layouts without page-level horizontal overflow.
- Touch targets should be at least 44px on narrow/touch layouts; compact desktop targets remain comfortably operable and meet the repository's gates.
- Do not truncate critical statutory, client, account or workflow data without an accessible way to obtain the full value.

## Product consistency

- Shared Platform, Practice Management and specialist modules use one shell, vocabulary and component recipe for equivalent interactions.
- Module branding may identify a product but must not fork the application control language.
- Marketing-page conventions do not enter operational application surfaces.
- Functional changes must not redesign unrelated UI.

## Definition of visually complete

A touched screen is complete only after comparison with repeated patterns and verification at desktop and narrow widths, keyboard/focus, forced colours, text spacing/reflow, loading/empty/error/long-value states where relevant, and the existing UI quality guard. Compilation alone is not visual acceptance.
