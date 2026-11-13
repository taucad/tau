---
title: 'UI Policy'
description: 'Design system entry point: principles, token architecture, typography, spacing, motion, and component composition for all Tau UI surfaces.'
status: active
created: '2026-03-14'
updated: '2026-11-13'
related:
  - docs/policy/color-policy.md
  - docs/policy/diagram-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/rendering-pipeline-policy.md
  - docs/policy/rendering-policy.md
  - docs/policy/react-policy.md
  - docs/research/billing-redesign-blueprint.md
  - docs/research/loading-states-ux-blueprint.md
---

# UI Policy

Internal reference for visual design decisions across all Tau UI surfaces. This is the parent entry point for the design system — it establishes principles and cross-references child policies for domain-specific rules.

## Rationale

Tau's UI spans a CAD editor, documentation site, auth flows, and embeddable components. Without codified visual rules, each surface drifts toward ad-hoc styling decisions. AI agents need explicit rules — not taste — to produce consistent, high-quality UI. This policy provides the constraints that make consistency automatic.

## 1. Design Principles

Five principles govern all visual decisions. When rules conflict, earlier principles take precedence.

### 1.1 Clarity Over Decoration

Every visual element earns its presence. No gratuitous chrome, shadows, or borders. Whitespace is a structural tool, not empty space. Information density is achieved through visual hierarchy, not reduction.

**Why**: Premium products communicate competence through restraint. Strategic whitespace increases perceived quality.

### 1.2 Consistency Through Tokens

Use semantic design tokens for all visual properties. Components never contain raw color values, hardcoded sizes, or magic numbers. Define raw `oklch()` color tokens in their owning stylesheet (Section 2).

**Why**: Tokens create a single source of truth. When the primary hue changes, every surface updates automatically.

### 1.3 Restraint in Color

Muted palettes for UI chrome. Reserve vibrancy for actionable elements (buttons, links), status indicators (success, error), and data visualization. Background surfaces use near-zero chroma.

**Why**: Saturated UI chrome competes with content. A CAD platform must keep geometry as the visual focus.

### 1.4 Accessibility by Default

WCAG 2.2 AA is the minimum bar. All contrast ratios must be met without opt-in effort. Semantic HTML and ARIA attributes are the primary interface for both users and tests. See [Accessibility Policy](accessibility-policy.md) for full rules.

### 1.5 Dark Mode Parity

Both light and dark modes are first-class. Dark mode uses lightness inversion of the shared `--l-*` scale — never separately authored color palettes. See [Color Policy](color-policy.md) for the inversion mechanics.

## 2. Token Architecture

Three-tier model. Components reference semantic tokens, semantics reference primitives. Never skip tiers.

Shared tokens live in `packages/ui/src/styles/tokens.css`, exported as `@taucad/ui/styles/tokens.css`. The app imports that stylesheet in `apps/ui/app/styles/global.css` and adds app-specific tokens there.

| Tier          | Location                                                                          | Example                                                       | Purpose                                             |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| **Primitive** | Shared `tokens.css` `:root`                                                       | `--l-base`, `--hue-primary`, `--c-primary`                    | Raw values: lightness levels, hue angles, chroma    |
| **Semantic**  | Shared `tokens.css` `:root`                                                       | `--primary`, `--muted-foreground`, `--border`                 | Purpose-named tokens consumed by Tailwind utilities |
| **Component** | Shared `tokens.css` for reusable tokens; app `global.css` for app-specific tokens | Shared `--chart-1`; app `--diagram-node`, `--scrollbar-thumb` | Scoped tokens for specific UI features              |

Tailwind v4 `@theme inline` in the shared stylesheet maps semantic tokens to utility classes (`bg-primary`, `text-muted-foreground`); the app stylesheet adds mappings for its own tokens. Components use these classes via `cn()`.

### When to Create a New Token

| Situation                                           | Action                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| New semantic purpose not covered by existing tokens | Add to the shared stylesheet with light + dark values                                                         |
| New component with unique color needs               | Create `--component-*` tokens in the shared stylesheet when reusable, or the app stylesheet when app-specific |
| One-off color for a single element                  | Use an existing semantic token with an opacity modifier                                                       |
| Three.js scene colors, WebGL materials              | Use constants in a `*.constants.ts` file — not CSS tokens                                                     |

## 3. Typography

Geist Sans for UI text. Geist Mono for code, terminals, and numeric data. Product UI uses three weights: 400 for text; 500 for the `display` and `page` headings, labels and controls; 600 for headings of 24px and below, object names and metric values. `font-light` and `font-bold` are not part of the scale; rendered Markdown keeps its own.

| Element           | Size               | Weight  | Line-height                              | Letter-spacing    |
| ----------------- | ------------------ | ------- | ---------------------------------------- | ----------------- |
| Body (prose)      | 16px (`text-base`) | 400     | 24px in product UI; 28px in docs `prose` | 0                 |
| Body (dense UI)   | 14px (`text-sm`)   | 400     | 20px                                     | 0                 |
| Code              | 14px (`text-sm`)   | 400     | 1.7                                      | 0                 |
| Metadata/captions | 12px (`text-xs`)   | 400-500 | 16px                                     | 0                 |
| Metric value      | 24px (`text-2xl`)  | 600     | 32px                                     | 0, `tabular-nums` |
| Diagram labels    | 14-16px            | 500     | 1.3                                      | 0                 |
| Tabular data      | 14px               | 400     | 1.4                                      | 0, `tabular-nums` |

**Minimum text size**: 12px. The only exception is icon labels in constrained spaces (e.g., file format badges at 9.5px) which must have a `title` attribute for accessibility.

### Headings

Render every heading through `Heading` (`@taucad/ui/components/heading`) or a title slot that composes `headingVariants`. `level` is the outline and picks the element; `variant` is the role and picks the look. Choose the level from the document outline (one `h1` per route, each nested heading one level below the heading that owns its region) and the variant from the table. Never pick a level for its size, and never put size, weight, line-height or tracking utilities on a heading or a title slot.

| Role (`variant`)  | Use and owner                                                                                                 | Size / line-height                        | Weight | Letter-spacing |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ | -------------- |
| `display`         | The one hero line of the start surface (`routes/_index` only)                                                 | 30 / 36px, 48 / 48px from `md`            | 500    | -0.025em       |
| `page`            | The page title (`PageHeader` only)                                                                            | 36 / 39.6px (`text-4xl`, `leading-[1.1]`) | 500    | -0.025em       |
| `section`         | A section of a page (`SectionHeader`)                                                                         | 24 / 32px (`text-2xl`)                    | 600    | -0.025em       |
| `title`           | A dialog, a gate screen or a standalone card (`DialogTitle`, `AlertDialogTitle`, `CardTitle variant='title'`) | 18 / 28px (`text-lg`)                     | 600    | 0              |
| `item`            | The name of an object in a card, row or drawer (`CardTitle`, `DrawerTitle`, `SheetTitle`)                     | 16 / 24px (`text-base`)                   | 600    | 0              |
| `label`           | A group or pane heading in dense UI (`CardTitle variant='label'`)                                             | 14 / 20px (`text-sm`)                     | 500    | 0              |
| `overline`        | A quiet label over a short group                                                                              | 12 / 16px (`text-xs`)                     | 500    | 0              |
| Empty-state title | `PanelEmptyState`                                                                                             | 16 / 24px (`text-base`)                   | 500    | 0              |

A title slot that sets `leading-none` (`DialogTitle`, `CardTitle`) keeps the role's size and weight and renders one line at the font size. A heading never renders larger than the page's `h1` at any breakpoint. Marketing and docs display headings keep their own scale ([DESIGN](design-policy.md) Typography).

**Why**: the same role rendered at three sizes and two weights across pages because each site wrote its own utilities, and levels were picked for their default size, which broke the outline.

CORRECT:

```tsx
<Heading level={3} variant='label'>
  Materials
</Heading>
```

INCORRECT:

```tsx
<h3 className='text-sm font-semibold'>Materials</h3>
<Heading level={2} variant='item' className='text-xl' />
```

**Enforced by**: `tau-lint/no-raw-heading-type` (error): size, weight, line-height and tracking utilities on `h1`–`h6`, `Heading` and the title slots, and the `page` and `display` variants outside their owners.

## 4. Spacing

4px base unit. All spacing values are multiples of 4: 4, 8, 12, 16, 24, 32, 48, 64. Use Tailwind spacing utilities (`p-2` = 8px, `p-4` = 16px, `gap-6` = 24px).

The radius scale in `packages/ui/src/styles/tokens.css` (`--radius-xs` through `--radius-4xl`) governs border radii. Use `rounded-*` Tailwind utilities.

## 5. Component Composition

### Pattern

All components follow the `cn()` + `cva` + `data-slot` pattern:

- **`cn()`** (`clsx` + `twMerge`) for conditional class merging. Always use `cn()`, never raw string concatenation.
- **`cva`** (class-variance-authority) for variant-driven styling. Define variants as an exhaustive set — no ad-hoc conditional classes.
- **`data-slot`** attributes on compound component sub-elements. Enables CSS targeting without prop drilling.

### Rules

- No inline `style=` for color, typography, or spacing. Exceptions: Three.js scene properties, dynamic values from user input (color pickers, sliders), and third-party library requirements.
- Variant composition over conditional class strings. If a component has 3+ conditional styles, extract a `cva` definition.
- Keep `bg-*` and `scroll-shadows-*` on separate elements. The scroll mask fades the entire masked element, including its background; put the background on an unmasked parent and the mask on the scrolling content.
- Use Tailwind opacity modifiers (`bg-neutral/30`, `border-border/50`) for transparent variants; allowed values follow [Color Policy](color-policy.md#opacity-modifiers).

### One Component Per Repeated Piece

A piece of UI that appears on more than one surface has one implementation, and every surface imports it. Before writing a badge, a notice, a summary row, a price, a payment method line or a plan card, look for the owner below; if the piece is new and will repeat, add it to the owner rather than to the screen.

| Piece                                                                            | Owner                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dialog and sheet close control                                                   | `DialogContent`, `SheetContent` in `packages/ui`                        |
| Wait indicator                                                                   | `WaitIndicator` and `utils/wait-timing` in `packages/ui`                |
| Plan cards, coming-soon icon and legend                                          | `@taucad/ui-kit/components/plan-cards` (app Billing and public pricing) |
| Card brand and saved payment method                                              | `@taucad/ui-kit/components/payment-method`                              |
| Plan catalogue (names, prices, features)                                         | `@taucad/billing/plan-catalog`                                          |
| Money formatting                                                                 | `formatUsd*`, `formatMonthlyPrice` in `@taucad/billing`                 |
| Billing badge, notice, inline error, summary rows, billing date, first-line icon | `apps/ui/app/components/billing/billing-primitives.tsx`                 |
| Settings rows and groups                                                         | `apps/ui/app/components/settings/settings-item.tsx`                     |

**Why**: the billing surfaces carried three card-brand formatters, four money formats and two plan grids that disagreed with the pricing page; one owner makes a wording or styling change a one-file change.

### Close Controls

A dialog or sheet closes from one control: a ghost icon button (`variant='ghost'`, `size='icon-sm'`) in the top inline-end corner, with the `X` glyph, `text-muted-foreground`, and the screen-reader name "Close". It is the same control, with the same hover and focus treatment, as "Close settings". `DialogContent` and `SheetContent` render it; never restyle it, reposition it or add a second bare `X`.

**Why**: the old close mark was a bare, half-opaque glyph with no hover surface and a 16px target; it read as decoration and was hard to hit.

### Icon Beside Text

An icon that sits beside a line of text is centred on the first line of that text, whatever the text wraps to. Put the icon in a box one line tall (`flex h-lh shrink-0 items-center`) inside a `flex items-start` row. Use `FirstLineIcon` or `IconLine` from the billing primitives, or the same two classes; never `items-center` on a row whose text can wrap, and never a margin nudge (`mt-0.5`).

CORRECT:

```tsx
<span className='flex items-start gap-2'>
  <span className='flex h-lh shrink-0 items-center'>
    <Info aria-hidden='true' className='size-4' />
  </span>
  <span>Canceling your plan keeps your account and your projects.</span>
</span>
```

INCORRECT:

```tsx
<span className='flex items-center gap-2'>{/* icon floats to the middle of a wrapped paragraph */}</span>
<Info className='mt-0.5 size-4' /> {/* breaks at any other font size or line height */}
```

**Why**: `1lh` follows the text's own line height, so the pair stays aligned at every size; a centred or nudged icon drifts as soon as the copy wraps.

### Coming-Soon Features

Mark a feature that is not available yet with the coming-soon icon (`ComingSoonIcon`, the lucide `Circle`: an empty, muted circle) in place of the tick, never with a tick, a greyed tick or a text suffix on each line. Any list that uses the icon shows `ComingSoonLegend` once beneath it, with the same icon and the words "Coming soon" only, and each such item carries the screen-reader prefix "Coming soon: ". A feature that exists on a plan is never marked coming soon.

**Why**: a tick means "you get this"; a list that mixes shipped and unshipped features under one mark misleads a buyer, and an unexplained icon is a puzzle.

### Loading

A region that is loading keeps its own node at its final geometry. It shows real content when any exists (current, remembered, or the previous frame of the same entity), otherwise its bare frame. After 1,000 ms it shows `WaitIndicator` in a slot the frame already has (a header's trailing slot, the viewer's status slot). Do not draw `Skeleton` shapes, swap a placeholder node for content, show an empty state before the content is known to be empty, or animate loaded content in.

A region is in an in-place loading state only when all four hold:

1. **Same node.** The node on screen during the wait holds the content afterwards; nothing is unmounted, or overlaid and then removed.
2. **True geometry.** Its box comes from a source of truth for this person and this project (a request hint, a device record, a fixed aspect ratio), and does not change when the content arrives.
3. **Nothing imitated.** It draws real content, the region's own frame (border, background, header, real controls), or nothing. No bar, block, grey card or icon stands for content that is not there.
4. **One arrival.** Content appears once, without an entrance animation, and changes pixels only inside the region.

The previous frame is held only for the same entity: a model being rebuilt keeps its last render and a list being refetched keeps its rows, but another project or chat shows its own remembered content or its frame, never the old one's under the new title. A native control that accepts real input from first paint and hands it to its richer successor once, keeping text, caret, selection, focus and composition, is content, not a placeholder.

Work with no shape to hold and an expected length over a second (the first download of a cloud project, a failed read, offline with nothing stored) shows an operation notice inside the frame: a title, one sentence, and a progress bar or Retry. A spinner remains correct inside a busy button.

`loading-state.ratchet.node.test.ts` in `apps/ui` holds the remaining `Skeleton` sites per file and only lets them go down.

**Why**: the staging load audit found a skeleton or a stand-in page on every Home load and every editor load, replaced a few hundred milliseconds later; each one is a second change on screen. A remembered frame and remembered content paint the truth first and reconcile in place ([loading states UX blueprint](../research/loading-states-ux-blueprint.md)).

## 6. Motion

Prefer CSS transitions. Honor `prefers-reduced-motion`. Animations are functional, not decorative.

| Interaction             | Duration  | Easing     |
| ----------------------- | --------- | ---------- |
| Hover, focus, toggle    | 100-150ms | `ease-out` |
| Dropdown, tooltip, menu | 200-300ms | `ease-out` |
| Modal, panel, route     | 300-500ms | `ease-out` |
| Maximum acceptable      | 500ms     | -          |

Only animate `transform` and `opacity` — these are GPU-composited. Never animate `width`, `height`, `margin`, or position properties.

Loading timing (§5 Loading): acknowledge a gesture within 100 ms. Delay an indicator 1,000 ms from the navigation or gesture. Keep a shown indicator 500 ms. At 10,000 ms say the wait is long and offer Retry. Do not hold content back for an indicator. The clock is one per wait, never per mount, so a region that mounts 900 ms into a wait shows its indicator 100 ms later. The constants live in `@taucad/ui/utils/wait-timing`; nothing on a load path defines its own delay or minimum. The indicator fades in over 150 ms, with no entrance under reduced motion; loaded content has no entrance animation.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Use `0.01ms` rather than `0s` to preserve `transitionend` and `animationend` event firing.

## Anti-Patterns

- Hardcoded hex values in `.tsx` files (use semantic tokens; see [Color Policy](color-policy.md))
- Inline `style=` for colors, spacing, or typography (use Tailwind classes)
- Raw `oklch()` in components (define tokens in their owning shared or app-specific stylesheet)
- Animation durations exceeding 500ms
- Shadows for elevation in dark mode (use tonal elevation via surface token lightness)
- `text-[11px]` or any arbitrary size below 12px without accessibility justification
- A second implementation of a piece that has an owner in §5 (a local money formatter, card-brand label, plan grid or status badge)
- A bare `X` glyph as a close control, or a restyled dialog close button
- A `Skeleton`, a full-window stand-in or an empty state for content that is not known yet; an indicator before 1,000 ms (see §5 Loading)
- A tick, or no explanation, on a feature that is not available yet
- A tinted border to signal state on a badge; state is a glyph plus words on the standard badge variants
- Size, weight, line-height or tracking utilities on a heading or title slot, or a heading level picked for its size (use `Heading` and its variants; see §3)

## References

- [UX Policy](ux-policy.md) — Interaction design: inline editing, progressive disclosure, confirmation patterns, user-side copy
- [Color Policy](color-policy.md) — OKLCH system, chroma ranges, contrast requirements
- [Diagram Policy](diagram-policy.md) — Mermaid diagram styling and authoring
- [Accessibility Policy](accessibility-policy.md) — ARIA conventions, E2E selectors
- [Rendering Pipeline Policy](rendering-pipeline-policy.md) — PBR defaults, materials, tone mapping
- [Rendering Policy](rendering-policy.md) — Virtualization, content budgets, scroll management
- [React Policy](react-policy.md) — Component memoization, state management, hook patterns
