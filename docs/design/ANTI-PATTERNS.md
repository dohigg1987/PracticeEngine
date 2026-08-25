# Prohibited application UI patterns

When uncertain, use the simplest established Fluent enterprise pattern.

## Visual decoration

- Gratuitous gradients or gradient text.
- Glassmorphism, glow effects or decorative shadows.
- Excessive border radii or pill-shaped components.
- Decorative coloured icon tiles for ordinary headings.
- Random colour assignment or status colour without semantics.
- “AI”, sparkle or magic-wand decoration.
- Decorative statistics without an operational decision attached.

## Layout and hierarchy

- Card-within-card layouts or placing every section in a card.
- Repetitive three-column feature-card layouts.
- Oversized marketing-style application headings.
- Centred operational layouts without specific task justification.
- Generic “welcome back” dashboard treatments.
- Large empty panels used to manufacture visual weight.
- Breaking established alignment/density for one feature.

## Components and content

- Recreating a Fluent button, field, dialog, table, badge, tab, menu, accordion or navigation item with native elements and custom CSS.
- Unnecessary badges, especially when ordinary text already conveys the state.
- Excessive explanatory microcopy or warnings for normal prerequisites.
- Emoji used as application icons.
- Hidden actions represented as plain body text.
- Internal IDs, hashes, storage keys, environment values or implementation terminology in normal workflows.

## Styling and maintenance

- Arbitrary CSS values where Fluent tokens exist.
- Generated Fluent class selectors, substring selectors into internals or broad `!important` overrides.
- Hard-coded colours outside controlled statutory/print or forced-colour exceptions.
- Styling global element selectors to imitate components.
- Redesigning unrelated UI during functional work.

## Review response

Do not “fix” an anti-pattern by changing only its colour or radius. First identify the semantic component and information hierarchy, then use the corresponding public Fluent pattern. Exceptions require a documented domain/accessibility reason and focused tests.
