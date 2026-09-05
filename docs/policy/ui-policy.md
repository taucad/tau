---
title: 'UI Policy'
description: 'Design system entry point: principles, token architecture, typography, spacing, motion, and component composition for all Tau UI surfaces.'
status: active
created: '2026-03-14'
updated: '2026-09-05'
related:
  - docs/policy/color-policy.md
  - docs/policy/diagram-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/rendering-pipeline-policy.md
  - docs/policy/rendering-policy.md
  - docs/policy/react-policy.md
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

Geist Sans for UI text. Geist Mono for code, terminals, and numeric data.

| Element           | Size               | Weight  | Line-height | Letter-spacing    |
| ----------------- | ------------------ | ------- | ----------- | ----------------- |
| Body (prose)      | 16px (`text-base`) | 400     | 1.6         | 0                 |
| Body (dense UI)   | 14px (`text-sm`)   | 400     | 1.5         | 0                 |
| Code              | 14px (`text-sm`)   | 400     | 1.7         | 0                 |
| H1                | 36px (`text-4xl`)  | 700     | 1.1         | -0.02em           |
| H2                | 28px (`text-3xl`)  | 600     | 1.2         | -0.02em           |
| H3                | 22px (`text-2xl`)  | 600     | 1.3         | -0.01em           |
| H4                | 18px (`text-lg`)   | 600     | 1.4         | 0                 |
| Metadata/captions | 12px (`text-xs`)   | 400-500 | 1.4         | +0.02em           |
| Diagram labels    | 14-16px            | 500     | 1.3         | 0                 |
| Tabular data      | 14px               | 400     | 1.4         | 0, `tabular-nums` |

**Minimum text size**: 12px. The only exception is icon labels in constrained spaces (e.g., file format badges at 9.5px) which must have a `title` attribute for accessibility.

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

## 6. Motion

Prefer CSS transitions. Honor `prefers-reduced-motion`. Animations are functional, not decorative.

| Interaction             | Duration  | Easing     |
| ----------------------- | --------- | ---------- |
| Hover, focus, toggle    | 100-150ms | `ease-out` |
| Dropdown, tooltip, menu | 200-300ms | `ease-out` |
| Modal, panel, route     | 300-500ms | `ease-out` |
| Maximum acceptable      | 500ms     | -          |

Only animate `transform` and `opacity` — these are GPU-composited. Never animate `width`, `height`, `margin`, or position properties.

Loading states: delay spinner appearance by 150-300ms. Once visible, keep for at least 300ms to avoid flicker.

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

## References

- [UX Policy](ux-policy.md) — Interaction design: inline editing, progressive disclosure, confirmation patterns
- [Color Policy](color-policy.md) — OKLCH system, chroma ranges, contrast requirements
- [Diagram Policy](diagram-policy.md) — Mermaid diagram styling and authoring
- [Accessibility Policy](accessibility-policy.md) — ARIA conventions, E2E selectors
- [Rendering Pipeline Policy](rendering-pipeline-policy.md) — PBR defaults, materials, tone mapping
- [Rendering Policy](rendering-policy.md) — Virtualization, content budgets, scroll management
- [React Policy](react-policy.md) — Component memoization, state management, hook patterns
