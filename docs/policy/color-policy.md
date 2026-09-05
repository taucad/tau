---
title: 'Color Policy'
description: 'OKLCH color system rules: hue architecture, lightness levels, chroma ranges, semantic tokens, contrast requirements, colorblind safety, dark mode, and anti-patterns for all Tau UI surfaces.'
status: active
created: '2026-03-14'
updated: '2026-09-05'
related:
  - docs/policy/ui-policy.md
  - docs/policy/diagram-policy.md
  - docs/policy/accessibility-policy.md
---

# Color Policy

Internal reference for the OKLCH color system and all color usage across the Tau codebase.

## Rationale

OKLCH provides perceptual uniformity — equal numeric changes in lightness produce equal perceived brightness changes regardless of hue. A documented color system prevents drift across 66+ UI components, ensures WCAG compliance, and gives AI agents precise chroma/lightness ranges for any new token without human judgment.

## 1. OKLCH Is the Canonical Color Space

Color tokens are defined as `oklch(L C H)`. Shared tokens live in `packages/ui/src/styles/tokens.css`, exported as `@taucad/ui/styles/tokens.css`. The app imports that stylesheet in `apps/ui/app/styles/global.css` and extends it with app-specific diagram and scrollbar tokens. No hex, HSL, or RGB in color token definitions. Components consume semantic tokens via Tailwind utilities, never raw oklch values.

**Why**: OKLCH is perceptually uniform (unlike HSL where blue at L=0.5 appears much darker than yellow at L=0.5), supports P3 gamut natively, and makes palette generation trivial by adjusting L independently of H and C.

**Enforced by**: `tau-lint/no-hardcoded-color` (warn in `.tsx` files) — flags hex, rgb, and hsl literals.

CORRECT:

```css
/* In packages/ui/src/styles/tokens.css */
--primary: oklch(var(--l-primary) var(--c-primary) var(--hue-primary));
```

```tsx
// In components
<button className="bg-primary text-primary-foreground">
```

INCORRECT:

```tsx
// Raw color in component
<button style={{ backgroundColor: 'oklch(0.57 0.19 180)' }}>
<div className="bg-[#14b8a6]">
```

## 2. Hue Architecture

Treat `--hue-primary` as the user-customizable accent hue, not as a generator for structural colors. A user's accent choice may recolor primary actions, focus, geometry selection, and explicitly chromatic component tokens. It must never recolor page, panel, navigation, input, border, card, popover, or ordinary selected-state tokens.

| Variable            | Derivation                         | Default       | Purpose                      |
| ------------------- | ---------------------------------- | ------------- | ---------------------------- |
| `--hue-primary`     | Base                               | 180deg (teal) | Brand accent and focus       |
| `--hue-secondary`   | `calc(var(--hue-primary) - 10deg)` | 170deg        | Explicitly chromatic accents |
| `--hue-destructive` | Fixed                              | 15deg         | Error, delete, danger        |
| `--hue-success`     | Fixed                              | 150deg        | Success, complete            |
| `--hue-warning`     | Fixed                              | 70deg         | Warning, caution             |
| `--hue-information` | Fixed                              | 250deg        | Informational                |
| `--hue-feature`     | Fixed                              | 280deg        | Feature highlights           |
| `--hue-highlighted` | Fixed                              | 330deg        | Highlighted/flagged          |

Do not define a neutral hue. Achromatic colors have no meaningful hue, and every structural neutral uses chroma `0`. Status hues remain fixed so their meaning does not change with the user's accent choice.

### Structural neutral invariant

The following tokens must use chroma `0` in light and dark mode and must remain byte-for-byte independent of `--hue-primary`: `background`, `foreground`, `muted`, `muted-foreground`, `secondary`, `secondary-foreground`, `neutral`, `neutral-foreground`, `accent`, `accent-foreground`, `border`, `input`, `popover`, `popover-foreground`, `card`, `card-foreground`, and all sidebar surface, foreground, border, and selected-state tokens.

Primary actions, `ring`, semantic statuses, charts, diagrams, highlighters, and geometry-specific selection may remain chromatic when color carries meaning. Ordinary active tabs, project rows, hover states, and layout chrome are structural neutrals, not brand accents.

## 3. Lightness Levels

A shared lightness scale from `--l-base` through `--l-deepest` defines the tonal range. Dark mode overrides the same scale variables rather than introducing a parallel palette.

| Variable         | Light Mode | Dark Mode | Purpose                            |
| ---------------- | ---------- | --------- | ---------------------------------- |
| `--l-base`       | 1.0        | 0.19      | Page and panel backgrounds         |
| `--l-surface`    | 0.965      | 0.245     | Muted and secondary surfaces       |
| `--l-subtle`     | 0.90       | 0.315     | Borders and inputs                 |
| `--l-element`    | 0.85       | 0.35      | Input backgrounds                  |
| `--l-medium`     | 0.55       | 0.55      | Semantic status colors (unchanged) |
| `--l-emphasized` | 0.47       | 0.67      | Muted foreground                   |
| `--l-high`       | 0.25       | 0.82      | Sidebar foreground                 |
| `--l-intense`    | 0.16       | 0.95      | Primary foreground                 |
| `--l-deepest`    | 0.16       | 0.95      | Primary text                       |

Dark mode uses `--l-base: 0.19`, avoiding pure black (which causes OLED smearing and halation for users with astigmatism).

## 4. Chroma Ranges

Chroma determines saturation intensity. Use the appropriate range for the token's purpose. Higher chroma should be reserved for elements that need to draw attention.

| Context              | Chroma      | Examples                                  | Rationale                                    |
| -------------------- | ----------- | ----------------------------------------- | -------------------------------------------- |
| Structural surfaces  | 0 exactly   | `--background`, `--muted`, `--card`       | Accent choice cannot tint application chrome |
| Borders / dividers   | 0 exactly   | `--border`, `--sidebar-border`            | Structure is expressed through lightness     |
| Muted UI chrome      | 0 exactly   | `--accent`, ordinary selected states      | Selection remains neutral                    |
| Chromatic components | 0.01 - 0.04 | `--diagram-node`, highlighter treatments  | Color is allowed only for a named purpose    |
| Interactive elements | 0.05 - 0.12 | `--diagram-node-border`, `--ring`         | Clear color without being dominant           |
| Primary / branded    | 0.15 - 0.22 | `--primary` (C=0.1898)                    | Strong, recognizable hue identity            |
| Status / semantic    | 0.18 - 0.25 | `--destructive`, `--success`, `--warning` | Must stand out from surrounding UI           |
| Data visualization   | 0.12 - 0.20 | `--chart-1` through `--chart-5`           | Distinct categories within a chart           |
| Vibrant / marketing  | 0.22 - 0.32 | Hero sections, promotional elements       | Requires P3 `@media` check above C=0.25      |

### Chroma and Lightness Interaction

Chroma peaks at mid-lightness and drops at extremes. Very light and very dark colors naturally have less visible chroma. When creating tokens at extreme lightness values, reduce chroma proportionally:

| Lightness Range | Chroma Scale Factor    |
| --------------- | ---------------------- |
| L < 0.20        | 0.40x of target chroma |
| L 0.20-0.30     | 0.55x                  |
| L 0.30-0.40     | 0.75x                  |
| L 0.40-0.65     | 1.00x (peak)           |
| L 0.65-0.80     | 0.85x                  |
| L 0.80-0.90     | 0.50x                  |
| L > 0.90        | 0.25x                  |

## 5. Semantic Token Usage

Components always use semantic Tailwind classes. Shared CSS-variable mappings live in `@theme inline` in `packages/ui/src/styles/tokens.css`; app-specific mappings extend them in `apps/ui/app/styles/global.css`.

| Need                 | Token                | Tailwind Class                        |
| -------------------- | -------------------- | ------------------------------------- |
| Page background      | `--background`       | `bg-background`                       |
| Primary text         | `--foreground`       | `text-foreground`                     |
| Secondary text       | `--muted-foreground` | `text-muted-foreground`               |
| Primary action       | `--primary`          | `bg-primary`                          |
| Subtle background    | `--muted`            | `bg-muted`                            |
| Structural selection | `--accent`           | `bg-accent`, `text-accent-foreground` |
| Border               | `--border`           | `border-border`                       |
| Input field          | `--input`            | `border-input`                        |
| Focus ring           | `--ring`             | `ring-ring`                           |
| Error state          | `--destructive`      | `bg-destructive`, `text-destructive`  |
| Success state        | `--success`          | `bg-success`, `text-success`          |

### Opacity Modifiers

Use Tailwind's opacity syntax for transparent variants: `bg-neutral/30`, `border-border/50`. Valid values: 5, 10, 20, 30, 40, 50, 60, 70, 80, 90.

CORRECT:

```tsx
<div className="bg-muted/30 border border-border/50">
```

INCORRECT:

```tsx
<div className="bg-muted bg-opacity-30">
<div style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
```

## 6. Contrast Requirements

### WCAG 2.2 AA (Mandatory)

| Content Type                       | Minimum Ratio       | Applies To                                    |
| ---------------------------------- | ------------------- | --------------------------------------------- |
| Normal text (<18px, <14px bold)    | 4.5:1               | All body text, labels, metadata               |
| Large text (>=18px or >=14px bold) | 3:1                 | Headings, large labels                        |
| Non-text graphical elements        | 3:1                 | Icons, borders, diagram lines, chart segments |
| Thin lines (<3px stroke)           | 4.5:1 (recommended) | Diagram edges, thin borders                   |

### OKLCH Lightness Heuristics

Exact contrast ratios require luminance calculation, but these ΔL heuristics provide reliable design-time estimates:

| Requirement             | Minimum ΔL |
| ----------------------- | ---------- |
| Body text (4.5:1)       | ΔL >= 0.55 |
| Large text (3:1)        | ΔL >= 0.35 |
| UI components (3:1)     | ΔL >= 0.30 |
| Graphical objects (3:1) | ΔL >= 0.25 |

Always verify with a contrast checker before shipping. Heuristics are not sufficient for compliance.

### Verification Tools

- [oklch.com](https://oklch.com) — OKLCH picker with P3 gamut visualization
- [apcacontrast.com](https://apcacontrast.com) — APCA calculator with font size guidance
- [Color.js](https://colorjs.io) — JS library with WCAG 2.1 and APCA contrast methods

## 7. Colorblind Safety

### Rules

1. Never rely on hue alone to convey information. Always pair with shape, pattern, label, or ΔL >= 0.15 between adjacent data points.
2. Avoid pairing hue ~20deg (red) with ~140deg (green) — confuses deuteranopia/protanopia (~7% of males).
3. Avoid pairing hue ~230deg (blue) with ~55deg (orange) when tritanopia support is required.
4. Maximum distinguishable categories with color alone: 8. Beyond 4 categories, add a secondary visual channel (shape, pattern, or label).

### Recommended Palettes for Data Visualization

For categorical data, prefer Okabe-Ito or Tol Bright. These maintain distinctness across all three dichromatic vision types.

| Palette           | Max Categories | Best For                                 |
| ----------------- | -------------- | ---------------------------------------- |
| Okabe-Ito         | 8              | General qualitative data                 |
| Tol Bright        | 7              | General qualitative, works in grayscale  |
| Tol High-Contrast | 3              | Minimal categories, strict accessibility |

### Chart Color Audit

The current `--chart-1` through `--chart-5` palette (Blue 250deg, Purple 290deg, Teal 180deg, Green 150deg, Orange 30deg) avoids the red-green danger zone. Blue-orange pairing is a minor tritanopia concern but tritanopia affects <0.01% of the population.

## 8. Dark Mode

Dark mode reuses the same `--l-*` variables with mode-specific values. Never introduce separate token names for a dark palette.

### Rules

1. Background: L ~0.18 (not pure black). Pure black causes OLED smearing and halation.
2. Primary text: L ~0.95 (not pure white). Extreme contrast causes glare.
3. Chroma adjustment: at low lightness, visible chroma is reduced. Dark mode chart colors use higher L (0.70 vs 0.55) with slightly reduced C (0.16 vs 0.18) to maintain perceived vibrancy.
4. Semantic status colors (`--destructive`, `--success`, etc.) keep L=0.55 in both modes via `--l-medium` — their identity must be mode-independent.

### Exceptions: Three.js and WebGL

Three.js scene colors, materials, and lights exist outside the CSS token system. Define these in `*.constants.ts` files (e.g., `axesColors` in `color.constants.ts`). They do not need to follow the token architecture but should be centralized per component group.

## Anti-Patterns

### Hardcoded Hex in Components

INCORRECT:

```tsx
<div style={{ borderColor: '#E5E5E5' }}>
<span style={{ color: '#666666' }}>
```

CORRECT:

```tsx
<div className="border-border">
<span className="text-muted-foreground">
```

**Known violations**: MagicUI components (`safari.tsx`, `border-beam.tsx`, `animated-gradient-text.tsx`) use hardcoded hex. These should accept optional color props with semantic token fallbacks.

### Inline OKLCH in Components

Define raw `oklch()` color tokens in the owning shared or app-specific stylesheet described in Section 1. Components that need dynamic colors (e.g., Monaco editor peek highlights) should reference CSS variables within the `oklch()` call: `oklch(0.75 0.15 var(--hue-primary) / 0.3)`.

### Separate Dark Mode Authoring

Never create standalone dark-mode colors. The lightness inversion system ensures both modes stay in sync. Adding manual dark overrides creates maintenance burden and risks inconsistency.

**Exception**: Component-scoped tokens like `--diagram-*` may define explicit dark-mode values when the inversion formula produces suboptimal results. These must be documented in the relevant component policy.

### Brand-Derived Structural Neutrals

Never derive structural surface, foreground, input, border, card, popover, or sidebar tokens from `--hue-primary` or `--hue-secondary`, even at low chroma. Use chroma `0` and express hierarchy through lightness.

## Summary Checklist

- [ ] All new color tokens use `oklch(L C H)` in their owning shared or app-specific stylesheet (Section 1)
- [ ] Chroma value falls within the range for the token's purpose (see Section 4)
- [ ] Every structural neutral has chroma exactly `0` and is independent of `--hue-primary`
- [ ] Both light and dark mode values defined (or derived via `--l-*` inversion)
- [ ] Text contrast >= 4.5:1 (normal) or >= 3:1 (large)
- [ ] Non-text graphical elements contrast >= 3:1
- [ ] No hardcoded hex/hsl/rgb in `.tsx` files
- [ ] Colorblind safety verified for data visualization elements
- [ ] Opacity uses Tailwind modifier syntax (`/30`, `/50`)

## References

- [UI Policy](ui-policy.md) — parent design system entry point
- [Diagram Policy](diagram-policy.md) — diagram-specific color tokens and contrast
- [Accessibility Policy](accessibility-policy.md) — ARIA and semantic HTML
- [oklch.com](https://oklch.com) — OKLCH color picker and palette tool
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — Web Content Accessibility Guidelines
