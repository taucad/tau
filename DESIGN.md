# Tau Design Language

This document governs every user-facing surface Tau ships: the CAD workspace (`apps/ui`), the documentation site (`apps/docs`), the published component library (`packages/ui`, `@taucad/ui`), and terminal surfaces (`packages/cli`, the `repos` TUI, and anything after them). It is the constitution; the `docs/policy/` documents are its statutes; nearest `AGENTS.md` files route their current operational application. When they disagree, this document wins, and the disagreement is a bug to fix in the lower document.

Two research documents ground the normative choices here: `docs/research/design-language-accessibility-standards.md` (standards synthesis: DTCG, WCAG 2.2, APCA, ARIA APG, terminal conventions) and `docs/research/docs-anti-slop-quality-gates.md` (documentation quality gates).

This is also the canonical reference for frontend and research-canvas design.
Skills route the work; they do not define another aesthetic. Recent persona,
disclosure and affordance rulings are reconciled in the
[design consolidation evidence](docs/research/artifacts/canvas-authoring/runs/2026-09-16-design-consolidation/review.md).

## Principles

1. **Enforced or broken.** Most Tau code and copy is written by agents. A design rule that lives only in prose will be violated at scale, politely, by something that read it and agreed with it. Every rule in this document either names its enforcement (a lint rule, a test, a token, a CI gate) or is a candidate for one; rules that cannot be enforced are stated as defaults with a named reviewer surface. This is the courage the agentic era actually requires — not more taste, but taste compiled into gates.
2. **Tokens are the only source of raw values.** No hex, no raw `oklch()`, no pixel literals in components. Color, type, spacing, radius, shadow, and motion all resolve through the token layer (`@taucad/ui/styles/tokens.css`). Enforced by `tau-lint/no-hardcoded-color` and review.
3. **Accessible by construction and verification.** Use reviewed token pairs and accessible primitives, then verify their actual composition, contrast and keyboard behavior. Lightness heuristics and component imports alone do not prove conformance. WCAG 2.2 AA is the floor, not the aspiration.
4. **The product is the brand.** Identity comes from typography, the teal hue, real product surfaces shown honestly, and restraint — never from decoration. Personality lives in copy and mascot moments; it never touches data displays, charts, or error output.
5. **Calm density.** Tau is a professional tool: dense, keyboard-first, quiet. Color is spent where it carries meaning and nowhere else. Monochrome is the default state of every functional surface.
6. **One system, many targets.** The web app, the docs site, the published components, and the terminal all derive from the same semantic vocabulary. A theme is a mapping over one scale, never a second palette. A terminal palette is a build target of the same system, degraded gracefully.

## People and progressive disclosure

Design one coherent workflow for a hobbyist or prosumer making a useful part and
a seasoned mechanical engineer inspecting exact changes. Expertise changes how
much detail someone needs now, not which product they must learn. Do not require
a novice/expert mode, Git knowledge, or an onboarding detour for ordinary work.
Do not remove precision to make the first view approachable.

| Layer                  | User question                                      | Presentation                                                                                                                       |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Orientation            | Where am I, is my work saved, and what needs me?   | Current project/revision, plain status and next action; readable at narrow widths.                                                 |
| Working detail         | What changed and what can I do with it?            | Human summary, affected files or identified parts, visible contextual actions such as Compare; expand within the existing surface. |
| Engineering inspection | Which values, assumptions and evidence support it? | Exact dimensions/units, constraints, checks, revision/base identities, paths, provenance and supported comparison.                 |

Derive these layers from the same facts. A model file is not necessarily one
part; name parts only when metadata establishes the mapping. Short summaries
must not obscure scope or round away precision. Unsupported or unknown
measurements remain explicit.

- **Relevance now, detail on request.** Show orientation and current work first.
  Keep primary navigation and entry to advanced actions discoverable. Hide empty
  capability sections until relevant, with a clear way to create/connect them.
  Search includes not-yet-loaded results; show incomplete progress rather than
  a false “No matches” while pages remain. Keep focus stable as results arrive.
- **Temporal hiding preserves history.** Recent work precedes an explicit
  Earlier disclosure. Fold repetitive idle checkpoints for display without
  deleting or squashing records. Keep current, first, named, fork/merge, restored
  and chat-linked revisions identifiable; show a branch lane only at a real fork.
  Closed projects and older chats follow the same recency principle.
- **Use the lightest useful depth.** Summary → related detail → exact evidence.
  Avoid stacked cards, repeated headings and folds that restate their parent.
  Disclosure labels describe their contents or current work, not a generic
  “Activity”. Keep disclosure icons aligned with the text they control.
  A diff inside a file row is a meaningful second level. Format-specific export
  options start collapsed below the primary export choice. Commentary, answers
  and deliverables stay outside routine activity folds. Supporting file trees
  may start collapsed, but Reveal in files must expand and select the target.
- **Respect inspection.** Streaming, telemetry and save settlement must not
  reopen a closed disclosure, erase an edit draft, reset selection, move focus
  or seize the reader's scroll. Retain stable identity and position. Announce
  meaningful lifecycle changes, not every token or file tick.
  Parameter updates retain the last valid model until its replacement is ready;
  keep requested and actually presented identity distinct rather than implying
  that old geometry already represents new values.
- **Never fold away a decision.** Approvals, destructive consequences, conflicts,
  actionable failures and uncertain outcomes stay visible when relevant. Explain
  unavailable actions. Put diagnostics behind details while keeping the
  consequence and recovery action outside in ordinary language.
  Secondary provenance hints may use a compact adjacent tooltip trigger with
  hover, keyboard and touch access, Escape dismissal and an accessible
  description. Use the short label “Inferred unit” for that provenance hint.
  An inferred-unit hint is not a manufacturing approval; preserve
  explicit declarations, unknown states and persistent safety/error handling.
- **Narrow means rearranged.** Stack, wrap or provide a visibly labelled alternate
  view. Preserve orientation and access to the same capabilities. Tooltips do
  not recover information hidden from touch users.
  The compact composer is a specific single-row design: shorten labels, remove
  redundant adornments and omit the agent picker when Tau is the only choice.
  Readiness may be summarized in its accessible tooltip, never the sole approval
  or recovery surface. Verify actual fit with all controls enabled; do not hide
  capabilities or let controls overlap to preserve the row.
- **Deferred UI respects its activity boundary.** Inactive settings must not
  trigger protected queries and unrelated error toasts merely because every
  panel was force-mounted. Preserve drafts explicitly. Expected, recoverable
  failures belong inline with their owning surface and next action, not as a
  duplicate global toast or a false empty result.

### Revisions and streamed work

A fresh Revisions pane starts with visible **Where you are** and **History**.
Branch management and the composer picker appear once additional branches are
relevant; a discoverable New branch action enables first use. Sync configuration
appears when a remote exists or the user opens Connect, with one concise backup
offer beforehand. First-connect
data sharing and opt-out remain visible before commitment. Connected backup
becomes a compact summary with an explicit change action. Current checkout
identity remains readable even when advanced controls are folded away.

In chat, one compact revision summary belongs directly after its user request,
before the assistant's reasoning, tools and answer, while changes are pending,
saved or uncertain. It is a card attached under the request bubble, sharing its
radius, whose whole header opens the details, so it reads as the request's own
state rather than as conversation. Update it in place. A reconnect is connection status, not a
revision state: keep the last known summary while the host log replays, and show
**Save not confirmed** with a visible Retry only when the host stays unreachable.
When the host confirms that no files
changed, remove the summary entirely; the assistant's plain-language result is
enough and no revision exists to inspect. Start from a confirmed base; do not
reserve a number or invent a snapshot. Show the confirmed result and expose
exact changes on request. Authored design files precede a labelled project-setup
group. The complete history belongs in Revisions, without duplicating its full
card in chat.

While a turn runs, the chat history always ends with one activity indicator
unless the newest content already moves: streaming text, a loading tool card
or a pending approval. The run state decides whether work is live; part states
only decide whether something else already shows it. A collapsed activity group
with a running row shows a spinner in place of its icon. The chat header and
sidebar add no second live cue.

**Saved**, **checks passed**, **work finished** and **backed up** are independent
facts. A saved revision can contain interrupted or unverified work. Loading is
not empty, unknown is not unchanged, and command acknowledgement is not proof
of effect. Give each state one primary owner: orientation owns current work,
history owns chronology, and backup owns transfer status. Use the same revision
identity and action vocabulary across compact and expanded surfaces.

Group adjacent provider-exposed reasoning into one collapsible body, preserving
tool/commentary boundaries and event identity. Reasoning and its supplied
summaries use normal-weight italics without a redundant “Reasoning” heading.
A thought that is still streaming says “Thinking…”. Collapsed copy may say
“Thought briefly” or a duration supported by actual timing; never invent reasoning or precision to make providers look identical.
Use consistent action vocabulary such as “Rendering” / “Rendered models”,
without repeating a provider-supplied verb (“Read Read”). This is a chat-specific
contract, not a requirement to italicize ordinary detail panels.

These are design-review defaults with scenario acceptance as their gate. The
[revision canvas checks](docs/research/artifacts/chat-turn-revision-story/live/check.mjs)
exercise this proposal; product owners verify equivalent behavior in their
actual state, streaming and command paths before shipping.

## Composition and visible affordances

Tau's Swiss design direction means clear alignment, an intentional grid,
typographic hierarchy, precise spacing and restrained structure. Use existing
Geist, neutral surfaces and shared radii. Do not introduce a new font, raw palette,
decorative numbering or sharp-cornered theme to signal that direction.

- Give each surface one job. Lead with the actual part, task, content or outcome.
  Use authentic examples and informative empty states. A marketing hero makes
  a specific product claim; a workbench needs operating content.
  Remove redundant routine controls when an existing discoverable flow serves
  the same task; preserve dedicated error-recovery actions.
- Frame peer panes once. Align tops, label columns and action baselines. Inside,
  prefer whitespace, rows and separators to nested cards, repeated badges and
  status dashboards. Number only real sequences or identities. Density comes
  from hierarchy, not smaller text.
  Keep picker breadcrumbs, search, group labels and results compact, with
  balanced outer gutters. Adornments share end inset and vertical centering;
  fields without adornments retain their padding. Reuse the owning component
  rather than introducing local spacing fixes.
  Numeric scrubbing uses meaningful admitted bounds, steps and units—not a
  serialization format's enormous safety limits as the visible interaction range.
- **Quiet buttons are still visible buttons.** Primary and contextual actions
  have a persistent label, icon/shape or boundary at rest. Use shared Button
  variants, clear action labels and visible neutral hover feedback. Keep enabled
  action text legible; muted metadata must not make it look disabled.
- Put infrequent row actions in a persistently reachable, named overflow menu.
  Fine-pointer hover may reveal shortcuts only when a visible route provides
  the same action. Include focus-within parity and coarse-pointer access. Hover,
  a hand cursor or an invisible hit region alone is insufficient.
- Verify rest, hover, keyboard focus, active/selected, open, busy and disabled
  states. Hover affects the actual hit target without moving layout or implying
  a different action. Selection is durable; hover is transient. Retain shared
  cursor semantics and equivalent keyboard feedback.
- Edit a name or value in context with Enter/Save and Escape/cancel. Use the
  existing inline editor or anchored popover form. Reserve modals for decisions
  of appropriate scope; name the affected object and committing verb.
  Related composer pickers switch on the first click: opening one must not
  merely dismiss the previous picker and require a second click.
- Do not use broad project-trust prompts or reassuring security badges as a
  substitute for enforced containment. Ordinary contained native CAD needs no
  trust ceremony; missing prerequisites get an actionable unavailable state.
  Separately authorized capabilities and data-sharing decisions remain explicit.

Review these defaults in rendered desktop/narrow states and interaction checks.
Restraint never waives contrast, focus, target-size or safety rules.

## Design and critique workflow

Before building, identify the subject, both audiences' immediate tasks, the
surface's single job and the source components that already express it. Choose
a brief layout and disclosure plan using existing token roles. Let real content
make the composition distinctive; compulsory aesthetic risk, new colors and
extra typefaces are not Tau's process.

Critique the plan against the brief, then the rendered result against the plan.
Remove structure or copy that does no work. Check competing CSS utilities,
loaded fonts, actual spacing and interactive states. Keep motion functional
within the budgets below. Record useful rejected directions in research evidence
so the next iteration does not repeat them.

For canvases, use a compact review header (`text-lg` subject, muted “/ design
review”, `text-xs` context), shared small controls and restrained `bg-background`
frames with token spacing. Keep scenario/theme/reset, source explanations and
review notes outside product panes. Peer frames have useful aligned heights,
reachable scrolling and footers; wrapped controls must not clip a full-height
board. The Agent activity canvas is a composition reference, not a dependency
or an authority over current product geometry.

## Design tokens

The token architecture is three-tier — primitive → semantic → component — and skipping a tier is a defect (`docs/policy/ui-policy.md` §2).

**Color** is OKLCH exclusively (`docs/policy/color-policy.md`):

- Primitives are **hue angles** (`--hue-primary: 180deg` teal, plus secondary, destructive, success, warning, feature, information, highlighted, stable, alert, verified, highlighter) and a **mode-responsive lightness scale** (`--l-base` … `--l-deepest`). Semantic tokens compose as `oklch(var(--l-*) <chroma> var(--hue-*))`.
- Structural neutrals are **zero-chroma** (`oklch(L 0 none)`). Brand-tinted grays are a named anti-pattern.
- Dark, black, and high-contrast themes are **lightness remappings of the one scale**, never separately authored palettes. `prefers-contrast: more` re-derives all three.
- **Contrast is verified on rendered pairs.** The lightness scale is Tau's version of the USWDS grade system: grades guide selection, but token pairs used as text-on-surface must pass measured WCAG 2.2 AA contrast (4.5:1 body, 3:1 large text) in every theme, including opacity and layered surfaces. When placing or moving a lightness step, check dark-theme pairs with APCA Lc values as a design-time instrument (Lc 75+ body, Lc 60+ secondary text) — WCAG 2.x remains the conformance claim, APCA never is. Rationale and thresholds: research doc Findings 3 and 5.
- Opacity modifiers: 5–90 in steps of 10, on semantic tokens only.

**Radius** is a calc-derived ladder (`--radius-xs` → `--radius-4xl`); under `corner-shape: superellipse(1.5)` support the whole scale upgrades to squircles globally. Never hand-pick a radius outside the ladder.

**Spacing** is a 4px base; multiples of 4 only.

**Shadows** are tokens (`--shadow-xs/sm/md`, `--shadow-menu`); menu overlays use the pre-blended opaque `--menu-*` tokens, never transparency.

**Interchange**: the CSS custom-property layer in `@taucad/ui/styles/tokens.css` is the single source of truth today. A DTCG-format (2025.10, pinned) JSON export is the sanctioned future interchange target for design tooling and the ANSI palette generator; it is generated _from_ the CSS layer, not maintained beside it.

## Typography

- **Geist Variable** (`--font-sans`) for UI and prose; **Geist Mono** (`--font-mono`) for code, data, paths, and kickers. Self-hosted, `font-display: swap`. No third face, ever.
- Scale per `docs/policy/ui-policy.md` §3: body 16/14px, code 14px, minimum 12px, H1 36px at −0.02em. Every scale step carries size, line-height, and weight together — never size alone.
- Numbers that align vertically (tables, timers, metrics) use `tabular-nums`.
- Placeholders use normal weight; selected filenames may retain their existing
  emphasis. Active sidebar navigation and project/chat rows do not gain weight
  just because they are selected; use the shared selected-surface treatment.
- **Mono kickers**: section labels on marketing and docs surfaces are ALL-CAPS Geist Mono at 12px with wide tracking, above the heading. This is the primary editorial rhythm device (borrowed principle, not pixels, from the entire.io study).
- Text must survive 200% zoom, 320px reflow, and user text-spacing overrides (WCAG 1.4.4 / 1.4.10 / 1.4.12).

## Color usage law

- Semantic tokens only in components; `tau-lint/no-hardcoded-color` enforces this on all `.tsx`.
- **Color belongs to the glyph, never the prose.** Status meaning renders as a colored leading icon beside neutral text — never green/orange/red label text. Success states use an uncolored icon where the context already implies success.
- Functional surfaces prefer foreground/monochrome over the accent. Hover states use the two-tone rule: muted at rest, foreground on hover.
- Primary actions use the shared `primary-action` grey-chrome finish and subtle
  sheen, including its high-contrast fallback. Its faint tint belongs to the
  existing action tokens; it does not authorize tinted structural neutrals or
  locally authored gradients.
- "Soft error" states (recoverable, informational failures) use the muted purple ramp, not destructive red. Destructive red is reserved for actions that lose data and the confirmation surfaces guarding them.
- Never encode meaning in hue alone — pair color with an icon, label, or position (CVD safety; research doc Finding 3).

## Motion

Budgets from `docs/policy/ui-policy.md` §6, unchanged and enforced by review: 100–150ms hover/focus, 200–300ms menus and popovers, 300–500ms modals, **500ms hard ceiling**. Animate `transform` and `opacity` only. Menus default to instant (`animated: false`) — snappiness is the brand. `prefers-reduced-motion` collapses durations to `0.01ms` (not `0s`, which breaks `transitionend`). Scroll-linked effects use the token-defined scroll-shadow utilities; never place `bg-*` on the same element as `scroll-shadows-*`.

For looping product stories, provide a visible keyboard-operable Pause/Play
control outside decorative hidden content, a reduced-motion equivalent that
conveys the same information, and paused work while offscreen or the document
is hidden. The whole composition must fit without moving or obstructing the
primary task/CTA. A story's reading holds do not waive transition budgets.
These are rendered-review defaults; illustrative future workflows retain a
visible preview label and never manufacture successful checks or physical effects.

When streaming text fades are used, animate only genuinely arriving content.
Do not delay delivery with a typewriter, re-fade settled text, change copyable
text or layout, or leave a hidden tail after stop/error/completion. Preserve
scroll-away and disclosure state; bound animation work and measure performance
rather than promising cost-free decoration.

Image-viewer arrow buttons and arrow keys change images immediately, without a
slide animation. Clicking the empty backdrop dismisses the viewer; clicking
an image or its controls does not. Keep an explicit Close action, Escape and
visible keyboard focus. Review clipping at narrow widths and large images.

Scroll fades indicate actual overflow without consuming layout space. Selecting
or opening a tab reveals it clear of the strip's edge fade; an intentional
within-tab title fade behind its close button remains smooth and unobstructed.
Verify both desktop and browser behavior, not a screenshot from a stale build.

## Accessibility

- **WCAG 2.2 Level AA is the normative floor** for all web surfaces. Two of its newest criteria bite hardest on a CAD app and get explicit treatment: **2.5.7 Dragging Movements** — every drag interaction (viewport orbit, gizmo transforms, sliders, panel resize) has a non-drag path (typed input, keyboard nudge, menu command); **2.5.8 Target Size** — interactive targets are ≥24×24 CSS px or spaced per the exception; the icon-button `xs` size is the sanctioned minimum, nothing smaller ships.
- **The component library is the choke point.** Accessibility work lands in `packages/ui`, so `apps/ui`, `apps/docs`, and external consumers inherit fixes from one place. Every `@taucad/ui` component names the APG pattern it implements (or states that none exists and documents its own keyboard/AT contract); the keyboard contract is part of the component's public API. Radix supplies the base semantics — prefer native HTML semantics first, and never add ARIA that the primitive already provides; incorrect ARIA is worse than none.
- **Enforcement**: role-based selectors are mandatory in tests (`getByRole`/`getByLabel`; class and testid selectors are forbidden — `docs/policy/accessibility-policy.md`), which makes a11y a side effect of testability. `packages/ui` component tests include axe-core smoke checks (jsdom). Automated checks catch only a subset: new interactive patterns get a manual keyboard + screen-reader pass before they ship.
- Codified ARIA per `docs/policy/accessibility-policy.md`: loading = `role="status"` + `aria-busy`, errors = `role="alert"`, canvas/preview = `role="img"` + label, toggles carry `aria-expanded`/`aria-pressed`, dialogs are labelled. Focus is always visible, and its geometry has exactly one owner: the `focus-outline` utility in `@taucad/ui`'s `tokens.css`, composed under whatever variant a control needs (`focus-visible:focus-outline`, `has-[…:focus-visible]:focus-outline`, `focus-within:focus-outline`). It renders a 2px inset outline in the `ring` token; `focus-outline-outside` is the only exception, for controls too thin to host an inset outline. Never restate the geometry in a component, and never use a box-shadow ring. Focus is never fully obscured by sticky chrome (2.4.11).
- The 3D viewport is inherently visual; its accessibility contract is equivalence, not simulation: every viewport operation is reachable by keyboard or command surface, and scene state is queryable as text. The full viewport a11y contract is an open investigation (research doc, coverage gaps).

## Components

- Base layer is shadcn-style over Radix primitives, living in `packages/ui` as `@taucad/ui`, one subpath export per module, no barrels. Composition uses `cn()` + `cva` variants + `data-slot` attributes — every part of a compound component is addressable by `data-slot`.
- The shared variant modules (`popover.variants.ts`, `menu.variants.ts`) are the design system's load-bearing wall: menu-like surfaces (dropdown, context menu, command, select, combobox) compose the same surface/item/label variants rather than restating classes. New overlay surfaces extend the variant modules; they do not fork them. Contract tests (`popover-surface-primitives.test.tsx` and peers) are the regression floor.
- Lucide-style icons use the shared token stylesheet's `1.5` default stroke.
  Preserve explicit non-default weights and non-icon SVG semantics; do not
  repeat per-icon overrides. Nested row/tab actions reuse shared action variants.
- Primitives are app-agnostic: no analytics, no cookies, no app hooks, no keyboard-service imports inside `packages/ui`. App concerns arrive by props (theme, persistence callbacks, telemetry callbacks). The dependency rule is mechanical: `type:package` may depend only on `type:package|lib|tool`.
- Interaction defaults from `docs/policy/ux-policy.md`: inline editing over dialogs; popovers for menu-triggered edits; no nested dialogs; destructive actions confirm with the named object; `ComboBoxResponsive` is the canonical searchable select; `slider-input` is the canonical Blender-style scrub control; clickable cards use a sibling link overlay, never an ancestor `onClick`.
- Pointer cursors are native hyperlink affordances by default. Actions use `--cursor-action` through the shared semantic selector or `cursor-action` utility, every action keeps visible hover and focus feedback, and specialized text/drag/resize/help/disabled cursors remain semantic. Sidebar navigation, including anchor-backed project/chat rows, follows the shared action-cursor preference; content hyperlinks retain native pointers. Enforced by `tau-lint/no-authored-pointer-cursor` and the computed-style sidebar regression.
- Boolean props are named `is/has/should/enable/…` (lint-enforced); keyboard handling goes through the keyboard service (`event.key`, never `event.code`; the `mod` abstraction for Cmd/Ctrl).

## Surfaces

### apps/ui — the workspace

Dense, dark-first, keyboard-first. Panels and floating surfaces come from the shared primitives; pane headers retain visible contextual actions or a named overflow trigger, with optional hover shortcuts under the affordance rules above. The sidebar, command palette, and keyboard service are the three navigation spines; a feature that only exists behind a pointer gesture is unfinished (2.5.7).

Workbench empty states use the shared clean panel presentation, not decorative
dashed boxes; intentional dropzones retain their functional boundaries. Settings
reuse app sidebar/group/search primitives, shadowless section cards with headings
above them, and flat row separators. Remove redundant section descriptions, not
help needed to make a decision. Native title-bar drag regions never cover links
or controls. These are rendered-review defaults, not a new component framework.

Cloud upgrade prompts use one shared neutral banner/action treatment, preserve
the project and return context, and distinguish missing entitlement from funding
or service failures. Self-host surfaces have no Tau billing surfaces or upsells. Commercial
terms and enforcement remain with their billing and deployment owners.

Shared design does not mean identical host chrome. Keep web-only marketing and
analytics-consent surfaces out of the desktop editor; retain access to relevant
legal information through its intended host route. Consent copy and data
practices remain subject to their policy and approval owners.

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

Write from the user's side: name what people control and recognize, not internal
implementation layers. Use plain verbs, sentence case and one job per label.
Controls name their effect (Save changes, Compare revisions); keep that name
through confirmation and outcome. Failure explains what happened and the next
recovery step without apology or vague reassurance. Empty states give orientation
and a useful next action, never an overlapping decorative card.
Call Tau-provided skills **system** skills, not “Built-in”. The file tree uses
the lowercase trailing `system` badge without a redundant lock; read-only
behavior still follows actual access metadata, never a path or label alone.

## Governance

- Changes to this document are reviewed diffs with rationale, like any code change. Rules only get stricter by default; loosening one names the cost that justifies it.
- The enforcement inventory (what makes each rule real): `tau-lint/no-hardcoded-color`, `tau-lint/no-authored-pointer-cursor`, `boolean-prop-naming`, the MDX rule suite, role-based selector tests, axe smoke tests, contract tests on variant modules, word-budget and API-coverage tests, Vale, and the release-gate umbrella. When a new rule lands here, its gate lands with it or the rule is marked "default, unenforced" until it does.
- Promote new durable design law through [the shared learning owner](.agents/skills/update-agent-memory/SKILL.md) into its policy or this document, with its gate. Keep unaccepted candidates in the existing task evidence; they do not become a competing authority.
