# Tau Design Language

This document governs every user-facing surface Tau ships: the CAD workspace (`apps/ui`), the documentation site (`apps/docs`), the published component library (`packages/ui`, `@taucad/ui`), and terminal surfaces (`packages/cli`, the `repos` TUI, and anything after them). It is the constitution; the `docs/policy/` documents are its statutes; `.cursor/rules/*.mdc` are case law. When they disagree, this document wins, and the disagreement is a bug to fix in the lower document.

Two research documents ground the normative choices here: `docs/research/design-language-accessibility-standards.md` (standards synthesis: DTCG, WCAG 2.2, APCA, ARIA APG, terminal conventions) and `docs/research/docs-anti-slop-quality-gates.md` (documentation quality gates).

## Principles

1. **Enforced or broken.** Most Tau code and copy is written by agents. A design rule that lives only in prose will be violated at scale, politely, by something that read it and agreed with it. Every rule in this document either names its enforcement (a lint rule, a test, a token, a CI gate) or is a candidate for one; rules that cannot be enforced are stated as defaults with a named reviewer surface. This is the courage the agentic era actually requires — not more taste, but taste compiled into gates.
2. **Tokens are the only source of raw values.** No hex, no raw `oklch()`, no pixel literals in components. Color, type, spacing, radius, shadow, and motion all resolve through the token layer (`@taucad/ui/styles/tokens.css`). Enforced by `tau-lint/no-hardcoded-color` and review.
3. **Accessible by construction.** Contrast is guaranteed by the palette's lightness arithmetic, not by per-screen audits. Semantics are inherited from APG-conformant primitives, not re-implemented. WCAG 2.2 AA is the floor, not the aspiration.
4. **The product is the brand.** Identity comes from typography, the teal hue, real product surfaces shown honestly, and restraint — never from decoration. Personality lives in copy and mascot moments; it never touches data displays, charts, or error output.
5. **Calm density.** Tau is a professional tool: dense, keyboard-first, quiet. Color is spent where it carries meaning and nowhere else. Monochrome is the default state of every functional surface.
6. **One system, many targets.** The web app, the docs site, the published components, and the terminal all derive from the same semantic vocabulary. A theme is a mapping over one scale, never a second palette. A terminal palette is a build target of the same system, degraded gracefully.

## Design tokens

The token architecture is three-tier — primitive → semantic → component — and skipping a tier is a defect (`docs/policy/ui-policy.md` §2).

**Color** is OKLCH exclusively (`docs/policy/color-policy.md`):

- Primitives are **hue angles** (`--hue-primary: 180deg` teal, plus secondary, destructive, success, warning, feature, information, highlighted, stable, alert, verified, highlighter) and a **mode-responsive lightness scale** (`--l-base` … `--l-deepest`). Semantic tokens compose as `oklch(var(--l-*) <chroma> var(--hue-*))`.
- Structural neutrals are **zero-chroma** (`oklch(L 0 none)`). Brand-tinted grays are a named anti-pattern.
- Dark, black, and high-contrast themes are **lightness remappings of the one scale**, never separately authored palettes. `prefers-contrast: more` re-derives all three.
- **Contrast is grade arithmetic.** The lightness scale is Tau's version of the USWDS grade system: token pairs used as text-on-surface must keep a lightness delta that passes WCAG 2.2 AA (4.5:1 body, 3:1 large text) in every theme. When placing or moving a lightness step, check dark-theme pairs with APCA Lc values as a design-time instrument (Lc 75+ body, Lc 60+ secondary text) — WCAG 2.x remains the conformance claim, APCA never is. Rationale and thresholds: research doc Findings 3 and 5.
- Opacity modifiers: 5–90 in steps of 10, on semantic tokens only.

**Radius** is a calc-derived ladder (`--radius-xs` → `--radius-4xl`); under `corner-shape: superellipse(1.5)` support the whole scale upgrades to squircles globally. Never hand-pick a radius outside the ladder.

**Spacing** is a 4px base; multiples of 4 only.

**Shadows** are tokens (`--shadow-xs/sm/md`, `--shadow-menu`); menu overlays use the pre-blended opaque `--menu-*` tokens, never transparency.

**Interchange**: the CSS custom-property layer in `@taucad/ui/styles/tokens.css` is the single source of truth today. A DTCG-format (2025.10, pinned) JSON export is the sanctioned future interchange target for design tooling and the ANSI palette generator; it is generated _from_ the CSS layer, not maintained beside it.

## Typography

- **Geist Variable** (`--font-sans`) for UI and prose; **Geist Mono** (`--font-mono`) for code, data, paths, and kickers. Self-hosted, `font-display: swap`. No third face, ever.
- Scale per `docs/policy/ui-policy.md` §3: body 16/14px, code 14px, minimum 12px, H1 36px at −0.02em. Every scale step carries size, line-height, and weight together — never size alone.
- Numbers that align vertically (tables, timers, metrics) use `tabular-nums`.
- **Mono kickers**: section labels on marketing and docs surfaces are ALL-CAPS Geist Mono at 12px with wide tracking, above the heading. This is the primary editorial rhythm device (borrowed principle, not pixels, from the entire.io study).
- Text must survive 200% zoom, 320px reflow, and user text-spacing overrides (WCAG 1.4.4 / 1.4.10 / 1.4.12).

## Color usage law

- Semantic tokens only in components; `tau-lint/no-hardcoded-color` enforces this on all `.tsx`.
- **Color belongs to the glyph, never the prose.** Status meaning renders as a colored leading icon beside neutral text — never green/orange/red label text. Success states use an uncolored icon where the context already implies success.
- Functional surfaces prefer foreground/monochrome over the accent. Hover states use the two-tone rule: muted at rest, foreground on hover.
- "Soft error" states (recoverable, informational failures) use the muted purple ramp, not destructive red. Destructive red is reserved for actions that lose data and the confirmation surfaces guarding them.
- Never encode meaning in hue alone — pair color with an icon, label, or position (CVD safety; research doc Finding 3).

## Motion

Budgets from `docs/policy/ui-policy.md` §6, unchanged and enforced by review: 100–150ms hover/focus, 200–300ms menus and popovers, 300–500ms modals, **500ms hard ceiling**. Animate `transform` and `opacity` only. Menus default to instant (`animated: false`) — snappiness is the brand. `prefers-reduced-motion` collapses durations to `0.01ms` (not `0s`, which breaks `transitionend`). Scroll-linked effects use the token-defined scroll-shadow utilities; never place `bg-*` on the same element as `scroll-shadows-*`.

## Accessibility

- **WCAG 2.2 Level AA is the normative floor** for all web surfaces. Two of its newest criteria bite hardest on a CAD app and get explicit treatment: **2.5.7 Dragging Movements** — every drag interaction (viewport orbit, gizmo transforms, sliders, panel resize) has a non-drag path (typed input, keyboard nudge, menu command); **2.5.8 Target Size** — interactive targets are ≥24×24 CSS px or spaced per the exception; the icon-button `xs` size is the sanctioned minimum, nothing smaller ships.
- **The component library is the choke point.** Accessibility work lands in `packages/ui`, so `apps/ui`, `apps/docs`, and external consumers inherit fixes from one place. Every `@taucad/ui` component names the APG pattern it implements (or states that none exists and documents its own keyboard/AT contract); the keyboard contract is part of the component's public API. Radix supplies the base semantics — prefer native HTML semantics first, and never add ARIA that the primitive already provides; incorrect ARIA is worse than none.
- **Enforcement**: role-based selectors are mandatory in tests (`getByRole`/`getByLabel`; class and testid selectors are forbidden — `docs/policy/accessibility-policy.md`), which makes a11y a side effect of testability. `packages/ui` component tests include axe-core smoke checks (jsdom). Automated checks catch only a subset: new interactive patterns get a manual keyboard + screen-reader pass before they ship.
- Codified ARIA per `docs/policy/accessibility-policy.md`: loading = `role="status"` + `aria-busy`, errors = `role="alert"`, canvas/preview = `role="img"` + label, toggles carry `aria-expanded`/`aria-pressed`, dialogs are labelled. Focus is always visible (`focus-visible` ring tokens) and never fully obscured by sticky chrome (2.4.11).
- The 3D viewport is inherently visual; its accessibility contract is equivalence, not simulation: every viewport operation is reachable by keyboard or command surface, and scene state is queryable as text. The full viewport a11y contract is an open investigation (research doc, coverage gaps).

## Components

- Base layer is shadcn-style over Radix primitives, living in `packages/ui` as `@taucad/ui`, one subpath export per module, no barrels. Composition uses `cn()` + `cva` variants + `data-slot` attributes — every part of a compound component is addressable by `data-slot`.
- The shared variant modules (`popover.variants.ts`, `menu.variants.ts`) are the design system's load-bearing wall: menu-like surfaces (dropdown, context menu, command, select, combobox) compose the same surface/item/label variants rather than restating classes. New overlay surfaces extend the variant modules; they do not fork them. Contract tests (`popover-surface-primitives.test.tsx` and peers) are the regression floor.
- Primitives are app-agnostic: no analytics, no cookies, no app hooks, no keyboard-service imports inside `packages/ui`. App concerns arrive by props (theme, persistence callbacks, telemetry callbacks). The dependency rule is mechanical: `type:package` may depend only on `type:package|lib|tool`.
- Interaction defaults from `docs/policy/ux-policy.md`: inline editing over dialogs; popovers for menu-triggered edits; no nested dialogs; destructive actions confirm with the named object; `ComboBoxResponsive` is the canonical searchable select; `slider-input` is the canonical Blender-style scrub control; clickable cards use a sibling link overlay, never an ancestor `onClick`.
- Boolean props are named `is/has/should/enable/…` (lint-enforced); keyboard handling goes through the keyboard service (`event.key`, never `event.code`; the `mod` abstraction for Cmd/Ctrl).

## Surfaces

### apps/ui — the workspace

Dense, dark-first, keyboard-first. Panels and floating surfaces come from the shared primitives; pane-header actions are hover-revealed with the transition on the parent container. The sidebar, command palette, and keyboard service are the three navigation spines; a feature that only exists behind a pointer gesture is unfinished (2.5.7).

### apps/docs — the documentation site

The docs site is the brand's front door and must feel like the product, not a bolted-on wiki:

- Fumadocs layouts themed entirely through Tau tokens via the shadcn preset — the visitor should not be able to tell where fumadocs-ui ends and Tau begins. Light and dark parity; black and high-contrast themes carry over.
- Landing page structure (principles from the entire.io study, executed in Tau's own voice): display-scale Geist hero with one high-contrast CTA; mono kickers; real product UI in frames as hero art — screenshots of actual Tau, never illustration; honest metrics with methodology captions; an install/quick-start one-liner with the license stated beside it.
- AI-readable by default: `/llms.txt`, `/llms-full.txt`, per-page markdown, copy-page-as-markdown. These are table stakes, and they are also the honesty gate — the page must read as well as text as it does as pixels.
- Content voice: task-first, Diátaxis-typed (`docType` frontmatter), short declarative sentences, zero filler. The anti-slop gates (word budgets that only move down, Vale with the `tau` style, API-coverage tests) are the enforcement; see `docs/research/docs-anti-slop-quality-gates.md`.

### packages/ui — the published library

Publishing raises the bar: every component documents its APG pattern and keyboard contract, carries JSDoc per `docs/policy/library-api-policy.md`, ships its variants as composable exports, and passes axe smoke tests. The token stylesheet (`styles/tokens.css`) is a public export and the only sanctioned way to theme the components. Breaking a token name is a breaking change of the package.

### CLI / TUI — the terminal

No WCAG exists here; these conventions are the policy (research doc Finding 6):

- Honor `NO_COLOR`. Never make color or exotic glyphs the sole carrier of meaning — the color-on-glyph rule applies in the terminal too: status color goes on the leading symbol (`✓ ● ○`), the text stays neutral.
- Every TUI capability has a scriptable, append-only equivalent (`--json`, plain output). Spinners and cursor-repositioning animations are off under `--no-animation`, non-TTY output, and CI.
- The terminal palette is a build target of the token system: semantic roles (success, warning, destructive, muted, verified, accent) map to ANSI-16 first, truecolor as progressive enhancement — never hardcoded truecolor.
- Long-form help lives on the docs site; `--help` stays short and structured.

## Voice

Engineering seriousness with personality confined to copy. Metrics are honest and captioned with their methodology. Claims are verifiable or absent. Licensing claims follow `LICENSING.md` verbatim — today that is Apache-2.0 across all Tau-authored source, so "open source" is accurate; if the partition ever changes, the copy changes with it, not before. In docs and UI copy alike: no filler transitions, no "simply", no unearned superlatives — the Vale `tau` style encodes the banned list, including the measured LLM focal-word inventory.

## Governance

- Changes to this document are reviewed diffs with rationale, like any code change. Rules only get stricter by default; loosening one names the cost that justifies it.
- The enforcement inventory (what makes each rule real): `tau-lint/no-hardcoded-color`, `boolean-prop-naming`, the MDX rule suite, role-based selector tests, axe smoke tests, contract tests on variant modules, word-budget and API-coverage tests, Vale, and the release-gate umbrella. When a new rule lands here, its gate lands with it or the rule is marked "default, unenforced" until it does.
- New durable design law discovered in practice gets promoted: from `learned-ui.mdc` case law into a policy doc or this document, with its gate. `learned-ui.mdc` is a holding pen, not an authority.
