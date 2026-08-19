# Visual quality release gate

No page is marked reviewed because it merely renders. Every page must pass the
following checks at desktop and narrow widths, with screenshots retained by the
test run when a check fails.

## 0. Whole-screen judgement

- A screen cannot pass on geometry alone. It must read as one deliberately
  designed workflow rather than a stack of individually valid components.
- The active navigation label, page title and section headings must not repeat
  the same words without adding hierarchy or meaning.
- Primary, secondary and destructive actions must have a clear hierarchy;
  disabled actions must not dominate the page.
- Tables, forms and evidence panels must be visually distinct without nested
  tinted containers, decorative rails or repeated borders.
- Native-control leakage, mismatched field heights, weak baselines, oversized
  helper copy and fragmented record rows are release failures.
- A human reviewer must record a desktop and narrow-width judgement after the
  automated collision, typography and overflow checks pass.

## 1. Grid and alignment

- Page content follows one left edge; headings, commands, panels and tables do
  not drift onto unrelated grids.
- Labels, controls and actions in one row share a visible baseline. Maximum
  unintended top/bottom variance: 2 px.
- Repeated columns use consistent starts. Numeric values are right-aligned and
  use tabular numerals.
- Icons and adjacent labels are vertically centred. Icon boxes do not change
  the text baseline.
- No pane, toolbar, sticky element or floating layer obscures document content.

## 2. Typography

- Segoe UI/system UI is used for application chrome; statutory output uses its
  controlled document typography only.
- Page title: 28–32 px; section title: 18–20 px; body/control text: 14 px;
  supporting text: at least 13 px. Text below 12 px is a release failure unless
  it is controlled statutory fine print.
- Sentence case is used. No decorative uppercase, tracking, pseudo-technical
  labels or unexplained acronyms.
- Links inherit the surrounding text size and weight unless their hierarchy
  independently requires emphasis.
- Formal labels retain approved casing: FRS 102, FRS 102 1A, SORP, LLP, HMRC.

## 3. Spacing and density

- Spacing uses the Fluent 4 px ramp. Arbitrary gaps and oversized empty panels
  are failures.
- Related label/control/help text stays together. Unrelated groups have a clear
  16–24 px separation.
- Table rows are compact but readable (normally 40–48 px). Empty states do not
  consume the dimensions of a populated register.
- Repeated borders, nested cards and decorative side rails are removed.

## 4. Controls and actions

- Use Fluent controls for interactive UI. Native controls require a documented
  reason (for example, file selection).
- Same-purpose controls use the same size and appearance. One primary action per
  local task; secondary/destructive actions are visually subordinate.
- Disabled state explains the prerequisite nearby. Loading does not move the
  control or change its dimensions.
- Every displayed record exposes the actions the user is authorised to take.

## 5. Hierarchy and content

- One page title and one section title per hierarchy level. No eyebrow that
  repeats the following heading.
- Copy is specific to accounting work. Remove marketing language, fabricated
  assurance, implementation detail and internal IDs.
- Status appears once at the point of use. Avoid duplicate counts or secondary
  metrics that do not aid the decision.

## 6. Colour

- Colour has a function: selected navigation, primary action, status, exception
  or section identity. It is not used as decorative card fill.
- Text and controls meet WCAG AA contrast. Meaning is never carried by colour
  alone.
- Statutory documents remain print-appropriate; application colour must not
  leak into issued accounts.

## 7. Tables and data presentation

- Column widths reflect content and do not force avoidable wrapping.
- Registers scroll or reflow without clipping. Resizable columns persist where
  users compare dense records.
- Empty, loading, error, partial and long-value states are each inspected.
- Dates, money, names, frameworks and statuses use one formatter across pages.

## 8. Responsive and zoom behaviour

- Desktop review at 1440 × 900 and 1920 × 1080.
- Narrow review at 390 × 844 and intermediate review at 768 px.
- 200% text zoom and 400% page zoom do not hide actions or information.
- Document outline/review panes collapse or resize; they never overlay the page
  without an explicit close control.

## 9. Interaction and navigation

- Keyboard focus order follows the visual order and remains visible.
- Stage selectors expose every child destination, not only a default page.
- Links and rows have clear affordance, accurate labels and predictable targets.
- Edits save, report success, survive reload and refresh dependent views.

## 10. Accessibility

- Heading order, landmarks, table headers, field labels and dialog names are
  semantically correct.
- Touch targets are at least 44 × 44 px on narrow screens.
- Error, loading and completion changes are announced without stealing focus.
- Automated axe/ARIA checks pass; keyboard-only journeys are manually checked.

## 11. Accounting-output integrity

- Report pages are visually inspected at 100% and print scale for clipping,
  overlapping columns, bad page breaks and footer collisions.
- Required pages, note numbering, cross-references, comparative columns,
  assurance wording, signatures and placeholders match the selected regime.
- Draft watermarks and unresolved placeholders block finalisation.
- PDF and DOCX output are opened and compared with the in-app source version.

## 12. Evidence required to pass

- Desktop and narrow screenshots after the final code change.
- No horizontal overflow at the page root.
- Computed alignment/size checks for repeated control rows and panes.
- Typecheck, unit tests, cross-browser journeys and production build pass.
- Reviewer records defects found, fixes made and any honest remaining limitation.

## Screen review ledger

Status values: `PENDING`, `FIXING`, `PASS`, `BLOCKED`.

| Area | Screen | Status |
| --- | --- | --- |
| Practice | Clients | FIXING |
| Practice | Client permanent file | FIXING |
| Practice | Team | FIXING |
| Engagement | Overview | PENDING |
| Source data | Imports and integrations | PENDING |
| Source data | Trial balance | PENDING |
| Source data | Mapping | PENDING |
| Adjustments | Journals | PENDING |
| Adjustments | Reconciliations | PENDING |
| Accounts builder | Working papers | PENDING |
| Accounts builder | Disclosures | PENDING |
| Accounts builder | Draft accounts | FIXING |
| Review and approval | Tasks | PENDING |
| Review and approval | Review points | PENDING |
| Review and approval | Accounts versions | PENDING |
| Review and approval | History | PENDING |
| Submission | Filing evidence | PENDING |
| Submission | Client portal | PENDING |
| Administration | Inbox | PENDING |
| Administration | Workspace settings | PENDING |
| Boundary | Sign in, onboarding and errors | PENDING |
