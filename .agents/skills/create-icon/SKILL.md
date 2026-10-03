---
name: create-icon
description: Create or revise monochrome product SVG icons in Tau's existing sprite. Use when a user defines a new UI icon, requests a custom glyph, or asks for an icon set matching Parts and Lucide.
---

# Create product icons

## Define and draw

1. Read `DESIGN.md`, the applicable `AGENTS.md` chain, and the current `apps/ui/app/components/icons/raw/parts.svg`. Search existing raw IDs and Lucide before drawing. Reuse an existing icon when it communicates the requested action or object clearly; reserve custom glyphs for missing domain concepts.
2. Record each concept's name, intended meaning, smallest displayed size and neighboring icons. Sketch at a 24 × 24 viewBox with Parts' 1.5-unit `currentColor` stroke, round caps and joins. Use simple geometry and consistent endpoints. Convey meaning through shape; do not rely on color, a tiny letter, or a tooltip to distinguish two glyphs.
3. Save one `apps/ui/app/components/icons/raw/<name>.svg` per new icon. Keep the SVG monochrome, without a background box, embedded text, raster content, remote references or fixed width/height. Filename is the sprite ID. Do not edit generated files.
4. For a set, put every icon in one visual contact sheet through [create-canvas](../create-canvas/SKILL.md). Compare at 16, 20 and 24 px in light, dark, black and high-contrast themes. Check silhouette, optical balance, line collisions, clipping and pairwise distinction. Keep the design evidence beside its research owner when the task has one.

## Integrate and verify

1. Follow [regen-sprite](../regen-sprite/SKILL.md): run `pnpm nx run ui:generate-svg-sprite`, then inspect changes to `sprite.svg` and `svg-icons.d.ts`. The generator may also write `payment-sprite.svg`; it should stay unchanged for product glyphs.
   Compare sprite byte size with its baseline and the approximate 125 KB target in `apps/ui/app/components/icons/README.md`; report the cost when adding a set.
2. Use the generated ID through the existing `SvgIcon` component. Give the parent control an accessible name or adjacent text; decorative glyphs use `aria-hidden`. Do not build a second icon registry or hardcode inline copies in production components.
3. Verify every ID exists in the generated declaration and sprite. Run `git diff --check`, `pnpm nx typecheck ui` and the relevant UI lint/test target for any consumer changed. Inspect the rendered consumer at its real size; a valid SVG file alone does not prove the sprite wrapper presents it correctly.
4. For changes to this skill, run `pnpm nx run scripts:validate-agent-config`. Record the exact checks, inspected sizes/themes, and unresolved browser or assistive-technology limitations. A task-owned research artifact follows the [durable research artifact contract](../create-research/artifacts.md).

Example: “Create a minimum-distance icon” produces `raw/measure-minimum-distance.svg`, updates the generated sprite/type, and uses `<SvgIcon id='measure-minimum-distance' aria-hidden />` beside a visible label.
