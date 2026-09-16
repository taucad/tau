---
name: create-canvas
description: >-
  Create or edit interactive high-fidelity Tau design canvases in Tau Brain
  research artifacts using live Tau tokens and React components. Use for new
  design canvases, canvas refinement, scenario boards, or canvas migrations;
  not for production feature implementation or editing historical screenshots.
---

# Create or edit a Tau canvas

## Resolve the design

1. Read the requested research owner and existing canvas before changing it.
   Compose [Create Research](../create-research/SKILL.md) for the owner/index and
   [artifact contract](../create-research/artifacts.md) for evidence. Write through
   `docs/research/artifacts/<subject>/`; never create a competing Brain checkout.
2. Read [DESIGN.md](../../../DESIGN.md) as the canonical design authority,
   especially People and progressive disclosure, Composition and visible
   affordances, and Design and critique workflow. Read applicable AGENTS chains
   and its UI, color, accessibility, React and TypeScript policy routes.
3. Creation: identify audience, user outcome, scenarios and existing components.
   Editing: retain scenario IDs, useful interactions and links; record changes.
   Snapshot existing bytes before replacing a design. Captures, transcripts and
   past verification remain historical evidence; add a labeled successor instead
   of changing what a past observation appears to show.

## Build with the product

- Use the shared research-canvas runner and authoring contract in
  [authoring.md](authoring.md). Reuse an existing scene before creating a new one.
- Apply the canvas review guidance in [DESIGN.md](../../../DESIGN.md#design-and-critique-workflow).
  [authoring.md](authoring.md#styling-baseline) locates the retained reference;
  the reference does not define a second set of design rules.
- Import actual `@taucad/ui/components/<component>` exports. Compile
  `@taucad/ui/styles/tokens.css` with Tailwind; a raw stylesheet link does not
  implement its `@theme` utilities. Use shipped Geist fonts, semantic utilities,
  shared radii, spacing, focus and motion. No copied token tables, hand-drawn
  replacement icons, remote fonts, or CSS facsimiles of available components.
- Reuse app components when their real dependency boundary permits it. Supply
  explicit local fixture props/providers; do not rewrite production source with
  AST/string transforms or disguise replacement app components as exact reuse.
- Before composing product chrome, record its current source component and
  geometry (pane header, user bubble, row, toolbar). Import it when feasible;
  otherwise identify the composition as proposed and reuse its current tokens
  and dimensions. Component imports alone do not make a different layout exact.
- Keep review controls outside the product frame. Provide scenario selection,
  theme selection, a reset path and an honest “What is real?” explanation.
  Distinguish shipping components, proposed compositions and simulated data.
- Every visible action works locally, is clearly disabled with an explanation,
  or is labeled outside-scope. Never call agents, mutate projects, publish or
  imply a real save from a fixture. No fake success toasts for unperformed work.
- Model related labels from one scenario and apply DESIGN's disclosure contract.
  Verify collapsed content is actually hidden; avoid force-mounted disclosure
  without its visibility contract. Simulated updates retain inspection state.

## Verify and deliver

1. Run the shared runner check and scenario-specific role/label-based browser
   assertions. Test empty, active, complete, no-change and failure states where
   relevant; include keyboard activation, dialog Escape/focus return and reset.
   Assert meaningful rendered content and inspect console/network failures;
   `pageerror` alone misses failed module loads and blank previews. For local
   save/merge/approval simulations, assert the resulting records and permissions,
   not merely a changed status label.
2. Check light, dark, black and high contrast; desktop, narrow panel and 320px
   reflow; 200% zoom/text resizing and reduced motion. Inspect rendered
   screenshots, not just DOM overflow. Ensure fonts actually load and computed
   semantic colors/radii match the source. Audit contrast and focus separately;
   importing tokens is not proof of accessibility conformance.
   Apply DESIGN's review checklist, including visible buttons at rest and actual
   hover/focus/selected/disabled behavior on the target's shared components.
3. Fix failures and repeat. Preserve compact results with exact commands,
   versions, source fingerprints and inspected screenshots. Record unverified
   screen-reader or browser cases honestly; never claim “perfect” from a smoke
   test. Run `pnpm docs:validate` for the research owner.
4. Update the existing artifact index with launch command, scenarios, source
   component map, fixture limitations, verification and successor links. Keep
   build products/traces in `out/research`, not Brain. Show the working preview.

When delegation is authorized, assign disjoint canvas directories to workers
and keep one coordinator-owned inventory. Each worker reads this skill, returns
checks and durable evidence, and cannot declare the whole inventory complete.

## Trigger checks

- “Create a canvas for revision history” → creation workflow.
- “Make this canvas match Tau” or `/create-canvas edit …` → same workflow,
  preserving the existing owner and scenarios.
- A research design task can compose this skill; production implementation,
  unrelated backend fixes and historical screenshot edits do not trigger it.
