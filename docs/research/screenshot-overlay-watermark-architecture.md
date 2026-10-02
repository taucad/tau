---
title: 'Screenshot overlay watermark architecture'
description: 'Centralise a top-left filename + file-extension SVG icon overlay onto every viewport screenshot inside screenshot-capability.machine.ts so all capture entry points produce a consistently labelled PNG/WebP without per-call-site stamping.'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: architecture
related:
  - docs/research/screenshot-viewport-shared-material-state-bleed.md
  - docs/research/agent-screenshot-rpc-resize-audit.md
  - docs/research/sharing-architecture.md
---

# Screenshot overlay watermark architecture

Design for a single, centralised overlay step in `apps/ui/app/machines/screenshot-capability.machine.ts` that stamps a top-left chip — file-extension SVG icon + full file path in the chat-purple chip palette — onto every screenshot the editor produces, regardless of which call site (`CaptureViewControl`, viewer drag-drop, `@`-suggestion menu, command palette, agent RPC, composite multi-angle) initiated the capture.

## Executive Summary

Every screenshot the chat surface produces today ultimately flows through one of two functions inside `screenshot-capability.machine.ts`: `captureScreenshots` (Three.js path) or `captureSvgScreenshots` (SVG path). Composite (multi-angle) captures still call `captureScreenshots` per angle and only diverge afterwards in `createCompositeImage`. Centralising the overlay inside those two functions guarantees every output is stamped, and every existing caller benefits without modification.

The overlay must read the active geometry unit's file path, which lives on `cadRef.context.file` — outside the screenshot machine's current dependency graph. The cleanest decoupling is to extend `ScreenshotOptions` with a new `overlay?: { filePath, iconKey }` block, resolved once in the existing per-call-site adapters (`captureViewScreenshot.utils.ts`, `chat-textarea.tsx`, `project-command-items.tsx`, `chat-context-actions.tsx`, agent-side `rpc-handlers.ts`) so the machine itself stays graphics-only. Drawing the chip uses Canvas 2D primitives (`roundRect` + `measureText` + `fillText`), an SVG-string→`HTMLImageElement` rasteriser for the file-extension sprite (the existing `<use href="#openscad">` reference cannot cross the canvas boundary directly), the existing `Geist Sans` web font (preloaded via `document.fonts.load()`), and the project's `--color-purple` OKLCH token (Baseline 2023, supported in Canvas `fillStyle` across every browser the app runs on).

## Problem Statement

The user wants every screenshot that lands in the chat draft (or in any other surface) to carry a small, identifiable label in the top-left corner showing:

1. The **file-extension icon** (the same coloured SVG used in the file tree, editor tabs, and `@`-mention chips — e.g. yellow OpenSCAD glyph for `.scad`, blue Zoo logo for `.kcl`, light-blue TypeScript for `.ts`/`.tsx`).
2. The **full file path** of the geometry unit being captured, rendered in the existing chat-chip purple palette (`bg-purple/10 text-purple` from `apps/ui/app/components/chat/context-chip.tsx`).

The user's screenshot examples make the desired styling explicit:

- Stamp at the top-left edge of the captured image.
- Match the visual identity of the `@filename.ts` chip used in the chat composer (purple chip background + filename text + extension-specific icon).
- Stamp **every** screenshot regardless of entry point (settings toolbar Camera button, drag-drop, `@`-suggestion screenshot, command palette, agent RPC, composite multi-angle).

Today the screenshot pipeline produces an unlabelled bitmap. Different call sites (chat composer, command palette, agent RPC) all have their own subtly different glue, but none of them stamps the resulting image. This means:

- Multiple screenshots in a single chat are visually indistinguishable when the user looks at the conversation history days later.
- The agent has no in-image cue about _which_ file it is looking at — particularly painful with multi-angle composite captures of unrelated geometry units.
- Any "remix this view" / "fork this share" surface that displays archived chat images loses provenance entirely.

## Methodology

The investigation proceeded by:

1. Reading every line of `apps/ui/app/machines/screenshot-capability.machine.ts` to identify the single chokepoint(s) where every output dataURL originates.
2. Tracing every call site that produces a screenshot today (`grep` for `screenshotCapability`, `requestScreenshot`, `captureView*`).
3. Mapping where the active file path lives in the application state (`cadRef.context.file = { path, filename }` in `apps/ui/app/machines/cad.machine.ts`).
4. Reading the existing chip + icon implementations (`context-chip.tsx`, `file-extension-icon.tsx`, `svg-icon.tsx`, `sprite.svg`) to understand what visual identity must be preserved.
5. Web research on:
   - Canvas 2D best practice for rasterising an SVG into a PNG layer (`drawImage` + serialised `<svg>` data URL; high-DPI scaling).
   - Loading custom web fonts before `fillText` (`document.fonts.load()` + first-paint dependency).
   - Canvas tainting rules when sourcing an SVG via `<use href="#sprite-id">` (cannot draw a `<use>` reference; must inline the symbol's contents into a standalone `<svg>` data URL).
   - OKLCH support in `CanvasRenderingContext2D.fillStyle` (Baseline 2023; Chrome 111+, Firefox 113+, Safari 15.4+).
   - Modern alternatives (SnapDOM, html2canvas-pro, dom-to-image-more) — all rejected, see Trade-offs.

## Findings

### Finding 1: Two physical chokepoints, one logical surface

Every screenshot dataURL the editor produces flows through one of two functions inside `apps/ui/app/machines/screenshot-capability.machine.ts`:

| Function                | Lines   | Inputs                             | Output                                    |
| ----------------------- | ------- | ---------------------------------- | ----------------------------------------- |
| `captureScreenshots`    | 502–706 | `gl`, `scene`, `camera`, `options` | `string[]` (one dataURL per camera angle) |
| `captureSvgScreenshots` | 339–471 | `svgElement`, `options`            | `string[]` (always length 1)              |

`captureCompositeScreenshot` (the actor at line 754) calls `captureScreenshots` first to render every angle, then hands the per-angle dataURLs to `createCompositeImage` (line 127) which draws them into a grid. Composite output therefore goes through `captureScreenshots` first, so stamping at the per-angle level is sufficient to guarantee composite tiles are stamped — but see Finding 7 for a refinement that draws **one** chip on the composite as a whole rather than one chip per tile.

This means the entire universe of screenshot outputs is funnelled through two ~150-line async functions. Stamping inside both — with shared overlay logic — is an architecturally minimal change.

### Finding 2: Call-site inventory

Every place that ultimately calls `screenshotCapabilityMachine` (directly or via `screenshotRequestMachine`):

| Call site                                     | File                                                                            | Path of file currently rendering               |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Camera button in viewer toolbar               | `apps/ui/app/components/geometry/cad/capture-view-control.tsx`                  | `useCad().getSnapshot().context.file.path`     |
| Camera button overflow (settings dropdown)    | `apps/ui/app/components/geometry/cad/capture-view-control.tsx`                  | same                                           |
| Composer drag-drop of a viewer pane           | `apps/ui/app/components/chat/chat-textarea.tsx` (drop handler)                  | resolved from dropped pane's per-view `cadRef` |
| `@`-suggestion menu screenshot item           | `apps/ui/app/components/chat/screenshot-actions.utils.ts` → `chat-textarea.tsx` | active chat's currently focused viewer         |
| Command palette "Capture view"                | `apps/ui/app/routes/projects_.$id/project-command-items.tsx`                    | `useCad().getSnapshot().context.file.path`     |
| `chat-context-actions.tsx` orthographic batch | `apps/ui/app/components/chat/chat-context-actions.tsx`                          | same                                           |
| Agent-tool RPC (`capture_screenshot`)         | `apps/ui/app/hooks/rpc-handlers.ts`                                             | tool-input file argument                       |

All seven call sites already have access to a `cadRef` (or to an explicit file argument from the agent), so wiring `{ filePath, iconKey }` into the request is a one-line change per site.

### Finding 3: The file path lives outside the screenshot machine's dependency graph

`screenshotCapabilityMachine` only takes a `graphicsRef` (the per-view graphics machine actor). It deliberately knows nothing about CAD files, kernels, or the editor's open-file model — and that decoupling is correct. Forcing it to subscribe to `cadRef` would re-couple the graphics layer to the kernel layer.

The file path lives on `cadRef.context.file` (`GeometryFile = { path: string; filename: string }`, defined in `libs/types/src/types/file.types.ts`). `useCad()` returns the per-view CAD actor ref, scoped by the surrounding `<CadProvider>` in `chat-viewer.tsx`. Every Camera-button / composer / command-palette caller is rendered inside both `<CadProvider>` and `<GraphicsProvider>`, so resolving `{ filePath, iconKey }` at the call site is trivial.

The architecturally correct boundary is: **call site reads `cadRef`, passes the resolved `overlay` block via `ScreenshotOptions`, machine consumes it as opaque data**. The same pattern that `chatCardChip`-style callers already use for the per-call `aspectRatio` / `quality` overrides.

### Finding 4: SVG sprites cannot be drawn via `<use href="#id">` on canvas

The repository renders icons via `<svg viewBox="0 0 56 56"><use href="#openscad" /></svg>` (`apps/ui/app/components/icons/svg-icon.tsx:67-71`). The sprite is mounted once in `<SvgSpriteMount />` at the app shell. This works in the DOM because every `<use>` target is in the same document.

It does **not** work when an `HTMLImageElement` loads the wrapper SVG as a standalone resource for `ctx.drawImage`. Web research confirms three constraints (StackOverflow Q53363289, whatwg/html#10641):

1. `Image.src = "data:image/svg+xml,<svg><use href='#openscad'/></svg>"` produces a blank image because the spec resolves `#openscad` against the SVG-as-image's own document, not the host document.
2. `HTMLImageElement` cannot accept a live DOM node; it can only resolve a URL.
3. SVG sources fetched cross-origin or containing `<foreignObject>` taint the canvas.

The workaround is well established: extract the matching `<symbol id="openscad">` from the in-memory sprite (or fetch `sprite.svg`), rewrite it as a standalone `<svg width="…" height="…" viewBox="…">…symbol-children…</svg>`, encode as a `data:image/svg+xml;charset=utf-8,…` URL, and load it into an `Image()`. Same-document data URLs are origin-clean, so the resulting `drawImage` call is canvas-safe.

For the format-3D badge and lucide fallback paths (currently rendered as React components in `file-extension-icon.tsx`), the same trick applies: render to a hidden offscreen `<svg>` via `renderToStaticMarkup` (or, simpler, ship a small dataURL table per-extension in `apps/ui/app/components/icons/raw/*.svg` that is already a self-contained SVG file — these can be imported as `?url` and loaded directly).

### Finding 5: OKLCH chip colour works in Canvas 2D today

The chip palette uses `bg-purple/10 text-purple`. From `apps/ui/app/styles/global.css:245`:

```css
--color-purple: oklch(60.29% 0.1875 289.06);
```

CSS Color Level 4 OKLCH is Baseline 2023:

- Chrome / Edge ≥ 111 (March 2023)
- Firefox ≥ 113 (May 2023)
- Safari ≥ 15.4 (March 2022 — was first browser to ship)

Canvas 2D `fillStyle` accepts any CSS `<color>` per the HTML spec. whatwg/html#8917 (resolved 2024) clarified that the _getter_ serialisation falls back to CSS Color 4 rules — but the _setter_ always accepted OKLCH because it's parsed as a `<color>` literal. Empirical confirmation: `ctx.fillStyle = 'oklch(60.29% 0.1875 289.06 / 0.10)'` is honoured directly in every browser the app supports, including the WebKit baseline (Safari 15.4+).

This means the chip background and text can use the **exact same** OKLCH literal as the CSS, with no hex-conversion intermediate step. The output stays automatically in sync with any future `--color-purple` token change at the call-site adapter (which can read `getComputedStyle(document.documentElement).getPropertyValue('--color-purple')` if synchronisation matters).

### Finding 6: Geist Sans font requires explicit pre-load before `fillText`

The chat-composer chip uses `text-xs` (`12px`) `font-sans` — i.e. `Geist Sans` (`apps/ui/app/styles/global.css:233`). Web research (FontFace.load MDN, `thelinuxcode.com/html-canvas-font` 2026 guide) confirms the canonical canvas-font gotcha: browsers defer web-font loading until a glyph is actually needed for a paint. Setting `ctx.font = '500 12px "Geist Sans"'` followed immediately by `ctx.fillText(...)` may rasterise with the system fallback if the font has not been used in the live DOM yet.

Two mitigations:

1. The chat composer is mounted on every project route, so `Geist Sans` is already in the font cache for the entire chat surface — including the viewer toolbar where Camera lives.
2. For agent-RPC callers (which can fire before any chip has rendered), call `await document.fonts.load('500 12px "Geist Sans"')` once before the first `fillText`. The result is cached for the document's lifetime.

The recommended belt-and-braces approach is to perform the `document.fonts.load` call in the new `drawScreenshotOverlay` helper itself, gated by a module-scoped `Promise<void>` so it runs at most once per page. This keeps the call sites uniform and avoids race conditions on cold loads.

### Finding 7: Composite captures need per-tile vs per-canvas decision

Composite multi-angle captures (e.g. orthographic-batch via `chat-context-actions.tsx`) currently render N angle-tiles into a grid. Two options for overlay placement:

| Option               | Where chip is drawn                                                      | Pros                                                                                    | Cons                                                                                                              |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A. Per-tile**      | Inside `captureScreenshots`, before composite assembly                   | Symmetrical with single-view path; works automatically for any future composite layout. | Chip appears N times in the composite (visually noisy).                                                           |
| **B. Per-composite** | Inside `createCompositeImage`, after grid assembly, single chip top-left | One clear chip describing the whole composite.                                          | Requires plumbing the overlay block down from `captureCompositeScreenshot` actor input to `createCompositeImage`. |

**Recommendation: Option B.** A composite already has angle labels per tile (`front`, `back`, `front-top`, …) printed by `createCompositeImage`. A second chip per tile would compete with those labels visually. The composite is one logical capture of one geometry unit, so one chip is the natural representation. The plumbing change is local: extend `createCompositeImage(screenshots, options, overlay?)` and call it from the composite actor. The single-view paths still draw the chip inside `captureScreenshots`/`captureSvgScreenshots`.

### Finding 8: Preview vs agent-facing screenshots

The current `ScreenshotOptions` already has an `output.isPreview: boolean` flag. The semantics today are "hide preview-only scene objects" (line 584–590). The same flag is a useful gate for the overlay:

- `isPreview: true` (chat-composer, command palette, drag-drop, `@`-suggestion) → **stamp**. The user wants visual identification in the chat history.
- `isPreview: false` (agent RPC `capture_screenshot` results) → **maybe stamp**. The agent already knows which file it captured (it passed the path as an argument), but a stamped image is still useful when the agent later re-reads the image from history. **Recommendation: stamp by default, allow per-call override.** The overlay tells the agent in-image what it is looking at, which is exactly the kind of context the agent loop benefits from.

### Finding 9: Visual specification

Final spec for the chip, derived from `apps/ui/app/components/chat/context-chip.tsx` and the user's reference screenshot:

| Property           | Value                                                                                | Source                                                                           |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Anchor             | top-left of captured image                                                           | user's screenshot                                                                |
| Margin from edge   | 12 px (×DPR)                                                                         | matches existing composite `padding` default                                     |
| Background fill    | `oklch(60.29% 0.1875 289.06 / 0.18)`                                                 | `bg-purple/10` is `0.10`; bumped to `0.18` for legibility on bright/white scenes |
| Text colour        | `oklch(60.29% 0.1875 289.06)`                                                        | `text-purple`                                                                    |
| Font               | `500 14px "Geist Sans", system-ui, sans-serif`                                       | upsized from `text-xs` (12px) for readability on captured 1200px-wide PNG        |
| Vertical padding   | 6 px                                                                                 | matches `py-px` scaled to 14px font                                              |
| Horizontal padding | 10 px                                                                                | matches `px-1.5` scaled                                                          |
| Icon-text gap      | 6 px                                                                                 | matches `gap-0.5` scaled                                                         |
| Icon size          | 16 px                                                                                | one step up from `size-2.5` (10 px) for the larger output                        |
| Corner radius      | 6 px                                                                                 | matches `rounded-xs` scaled                                                      |
| Path truncation    | from the **left** (`…/path/main.scad`), max width = `min(image_width × 0.6, 480 px)` | matches the editor pane's `dir='rtl'` truncation pattern from learned-ui facts   |
| Drop shadow        | none                                                                                 | chip background already provides contrast                                        |

If the path truncates, an HTML title-style tooltip is irrelevant (image has no hover surface). The left-truncation rule keeps the most-distinguishing part of the path (filename + parent dir) visible — the same constraint the file-tree pane handles via `dir='rtl'`.

### Finding 10: DPR / pixelRatio interaction

`captureScreenshots` already calls `screenshotRenderer.setPixelRatio(pixelRatio)` (line 570) where `pixelRatio = useHighDpi ? gl.getPixelRatio() : 1`. The screenshot canvas is sized at `width × height` _CSS pixels_ but the renderer paints into `width × pixelRatio × height × pixelRatio` device pixels. `screenshotCanvas.toDataURL` exports the device-pixel buffer directly.

The overlay must therefore be drawn into the **device-pixel** coordinate space — i.e. all the spec values above need to be multiplied by `pixelRatio` before issuing canvas commands, OR the overlay-helper must call `ctx.scale(pixelRatio, pixelRatio)` first and then issue the unscaled commands. The latter mirrors the existing pattern in `captureSvgScreenshots:426` and is the easier mental model.

The SVG-icon raster source must be loaded at `iconSize × pixelRatio` natural dimensions (set on the standalone `<svg width=… height=…>` wrapper) so the rasterisation is crisp at native resolution — mirrors the high-DPI canvas best practice from the SVG-to-canvas web research.

### Finding 11: Existing tests already cover the chokepoint

`apps/ui/app/machines/screenshot-capability.machine.test.ts` tests the actor lifecycle. `apps/ui/app/machines/screenshot-capability.utils.test.ts` (created during the WebGPU material-bleed fix) tests the per-screenshot helper layer. The new overlay logic should land as a separate `screenshot-overlay.utils.ts` (pure rendering functions: `drawScreenshotOverlay(ctx, options)`, `loadIconRaster(iconKey, sizePx)`) with co-located unit tests using `vitest-canvas-mock` for the layout math and a Playwright e2e that asserts pixel-rect colour at `(12, 12)` after capture.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                           | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Extend `ScreenshotOptions` (in `libs/types`) with an optional `overlay?: { filePath: string; iconKey?: IconId; format3dExtension?: FileExtension }` block. Keep it optional so non-CAD callers (future) can opt out.                                                                                                                                                             | P0       | Low    | High   |
| R2  | Create `apps/ui/app/machines/screenshot-overlay.utils.ts` with three pure functions: `loadIconImage(iconKey, sizePx)` (cached `HTMLImageElement` per `(iconKey, sizePx)`), `ensureChipFontLoaded()` (memoised `document.fonts.load` Promise), `drawScreenshotOverlay(ctx, { width, height, pixelRatio, overlay })`. Co-locate with `screenshot-capability.utils.ts`.             | P0       | Med    | High   |
| R3  | Wire `drawScreenshotOverlay` into `captureScreenshots` after `screenshotRenderer.render(...)` and before `toDataURL` (line 689). Same wire into `captureSvgScreenshots` after `context.drawImage(img, …)` and before `canvas.toBlob` (line 434).                                                                                                                                 | P0       | Low    | High   |
| R4  | Plumb `overlay` through `createCompositeImage` and apply it **once** to the composite canvas at the top-left, after the grid is drawn but before the format encode (line 245). Suppress per-tile overlay inside `captureScreenshots` when the caller is the composite actor (pass `__suppressOverlay: true` flag, or run two distinct private capture functions). See Finding 7. | P0       | Med    | High   |
| R5  | Update `captureViewScreenshot` (`apps/ui/app/components/chat/capture-view-screenshot.utils.ts`) to accept `cadRef?: CadActorRef` and resolve `{ filePath, iconKey }` from `cadRef.getSnapshot().context.file` before dispatching.                                                                                                                                                | P0       | Low    | Med    |
| R6  | Update every call site (Findings 2 table) to thread the overlay block through. For sites that already have `useCad`, the change is one line.                                                                                                                                                                                                                                     | P0       | Low    | Med    |
| R7  | Add a `chatScreenshotOverlay` cookie (default on) so the user can disable the chip if it ever interferes with a workflow. Lives next to `useImageQuality`. Not exposed in settings UI initially — cookie only — to keep MVP tight.                                                                                                                                               | P2       | Low    | Low    |
| R8  | Add a Playwright e2e under `apps/ui-e2e` that captures via `CaptureViewControl`, decodes the resulting PNG, and asserts `(12, 12)` is within ΔE 5 of `oklch(60.29% 0.1875 289.06 / 0.18)`. Keep it small and explicit.                                                                                                                                                           | P1       | Low    | Med    |
| R9  | Document the contract in `apps/ui/app/machines/screenshot-capability.machine.ts` with a JSDoc block on `captureScreenshots` referring back to this research doc.                                                                                                                                                                                                                 | P1       | Low    | Low    |

## Trade-offs

### Drawing the overlay vs. rendering it through React + html2canvas

| Approach                                                  | Pros                                                                                                        | Cons                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hand-rolled Canvas 2D (recommended)**                   | Zero new deps; deterministic; fast; runs inside the existing async pipeline; ~80 LOC; OKLCH works directly. | Need to maintain SVG-icon raster cache and font-load gate ourselves.                                                                                                                                                                                                                                                   |
| **html2canvas / SnapDOM / dom-to-image**                  | Re-uses live `<ContextChip>` JSX → guaranteed pixel parity with chip in the DOM.                            | Adds 30–80 KB dep; SnapDOM watermark plugin is "coming soon" not shipped (web research, May 2026); requires actually mounting the chip in the DOM offscreen, which races with React-18 concurrent commit; html2canvas-pro lags Chrome's modern colour functions; introduces an unnecessary DOM round-trip per capture. |
| **WebGL/WebGPU shader pass into the screenshot renderer** | One pipeline, no canvas round-trip.                                                                         | Requires implementing text glyph atlas generation; a single-pass shader for variable-width text + dynamic image is overkill for a chip; couples the overlay to the renderer backend (would need WebGL+WebGPU forks).                                                                                                   |

The hand-rolled Canvas 2D path is the only one that is small, dependency-free, deterministic, and renderer-agnostic.

### Per-tile vs per-composite chip placement (composite path)

See Finding 7. Per-composite (Option B) wins because the composite already has per-tile angle labels and a single chip is more legible.

### Stamping inside `screenshot-capability.machine.ts` vs at every call site

| Option                               | Pros                                                                          | Cons                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Inside the machine (recommended)** | One implementation, every caller benefits, future call sites get it for free. | Couples the machine slightly more (now also accepts overlay metadata in options).       |
| **At each call site**                | Machine stays graphics-only.                                                  | Six call sites × forgotten-stamp risk; agent RPC + future composite layouts will drift. |

The machine already accepts call-site-specific data (`aspectRatio`, `zoomLevel`, `cameraAngles`, `composite` config). Adding `overlay` as another piece of caller-provided data is consistent with the existing contract. The visual rendering (icon load, font load, fillText, roundRect) lives in the machine, so the call site only knows _what_ to stamp, not _how_.

### Reading file path from `cadRef` snapshot vs subscription

| Option                                                             | Pros                                                                                                                                                    | Cons                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **`cadRef.getSnapshot().context.file` at call time (recommended)** | Captures the file path at the exact moment of capture; no subscription overhead; no stale-state risk because the screenshot is synchronous-after-event. | Each call site must remember to read it.                                                  |
| **Subscribe in screenshot-capability machine**                     | Machine always knows current file.                                                                                                                      | Re-couples graphics to CAD, breaks the existing dependency boundary, complicates testing. |

Snapshot-at-call-time wins. Each call site already has `useCad()`/`useGraphics()` in scope, so the read is one line.

## Code Examples

### Proposed `ScreenshotOptions.overlay` shape

```ts
// libs/types/src/types/cad.types.ts (or screenshot.types.ts if extracted)
export type ScreenshotOverlay = {
  /** Full path of the geometry unit being captured, e.g. `src/main.scad`. */
  readonly filePath: string;
  /**
   * Sprite/PNG icon key for the file extension, resolved at call time via
   * `getIconIdFromExtension(getFileExtension(filePath))`. When undefined,
   * the overlay falls back to the lucide `File` glyph.
   */
  readonly iconKey?: IconId;
};

export type ScreenshotOptions = {
  // ...existing fields...
  readonly overlay?: ScreenshotOverlay;
};
```

### `drawScreenshotOverlay` skeleton

```ts
// apps/ui/app/machines/screenshot-overlay.utils.ts
import { getIconImage, ensureChipFontLoaded } from './screenshot-overlay-icon-cache.js';

const chipFillStyle = 'oklch(60.29% 0.1875 289.06 / 0.18)';
const chipTextStyle = 'oklch(60.29% 0.1875 289.06)';
const chipFont = '500 14px "Geist Sans", system-ui, sans-serif';

export async function drawScreenshotOverlay(
  ctx: CanvasRenderingContext2D,
  args: {
    readonly canvasWidth: number; // device pixels
    readonly canvasHeight: number;
    readonly pixelRatio: number;
    readonly overlay: ScreenshotOverlay;
  },
): Promise<void> {
  await ensureChipFontLoaded();

  ctx.save();
  ctx.scale(args.pixelRatio, args.pixelRatio);

  ctx.font = chipFont;
  const truncated = truncateFromLeft(
    ctx,
    args.overlay.filePath,
    /* maxWidth */ Math.min((args.canvasWidth / args.pixelRatio) * 0.6, 480),
  );
  const textWidth = ctx.measureText(truncated).width;

  const iconSize = 16;
  const padX = 10;
  const padY = 6;
  const gap = 6;
  const chipWidth = padX * 2 + iconSize + gap + textWidth;
  const chipHeight = padY * 2 + Math.max(iconSize, 16);

  const chipX = 12;
  const chipY = 12;

  ctx.fillStyle = chipFillStyle;
  ctx.beginPath();
  ctx.roundRect(chipX, chipY, chipWidth, chipHeight, 6);
  ctx.fill();

  if (args.overlay.iconKey) {
    const iconImage = await getIconImage(args.overlay.iconKey, iconSize);
    ctx.drawImage(iconImage, chipX + padX, chipY + (chipHeight - iconSize) / 2, iconSize, iconSize);
  }

  ctx.fillStyle = chipTextStyle;
  ctx.textBaseline = 'middle';
  ctx.fillText(truncated, chipX + padX + iconSize + gap, chipY + chipHeight / 2);

  ctx.restore();
}
```

### Standalone-SVG rasteriser for sprite icons

```ts
// apps/ui/app/machines/screenshot-overlay-icon-cache.ts
const cache = new Map<string, Promise<HTMLImageElement>>();

export function getIconImage(iconKey: string, sizePx: number): Promise<HTMLImageElement> {
  const cacheKey = `${iconKey}@${sizePx}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    // Fetch the inlined sprite that <SvgSpriteMount /> already injected.
    const sprite = document.querySelector('svg[data-svg-sprite]');
    const symbol = sprite?.querySelector(`#${iconKey}`);
    if (!symbol) throw new Error(`Icon not found in sprite: ${iconKey}`);

    const viewBox = symbol.getAttribute('viewBox') ?? '0 0 56 56';
    const inner = symbol.innerHTML;
    const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${viewBox}">${inner}</svg>`;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`;

    const img = new globalThis.Image();
    img.src = url;
    await img.decode();
    return img;
  })();

  cache.set(cacheKey, promise);
  return promise;
}
```

### Wire-in inside `captureScreenshots`

```ts
// inside captureScreenshots loop, after screenshotRenderer.render(...) (line 687)
if (options?.overlay && !options.__suppressOverlay) {
  const overlayCtx = screenshotCanvas.getContext('2d');
  if (overlayCtx) {
    await drawScreenshotOverlay(overlayCtx, {
      canvasWidth: screenshotCanvas.width,
      canvasHeight: screenshotCanvas.height,
      pixelRatio: screenshotRenderer.getPixelRatio(),
      overlay: options.overlay,
    });
  }
}
```

> NOTE: getting a `2D` context from a canvas that already has a WebGL/WebGPU context attached returns `null` — the screenshot canvas is created fresh in `captureScreenshots:556` and only WebGL/WebGPU is bound, so we either (a) blit into an intermediate 2D canvas before encoding, or (b) call `screenshotRenderer.getContext().readPixels()` into a 2D canvas, draw the overlay, and then `toDataURL`. Approach (a) is the cleanest and matches the existing `createCompositeImage` flow.

### Wire-in inside `captureSvgScreenshots`

`captureSvgScreenshots` already uses a 2D canvas (line 416), so the integration is direct — call `drawScreenshotOverlay` between `context.drawImage(img, …)` and `canvas.toBlob(…)`.

## Diagrams

### Today's flow

```
call site ──▶ screenshotRequestMachine ──▶ screenshotCapabilityMachine
                                                  │
                              ┌───────────────────┴──────────────────┐
                              ▼                                      ▼
                    captureScreenshots                       captureSvgScreenshots
                              │                                      │
                              ▼                                      ▼
                       toDataURL  (raw bitmap)            toDataURL  (raw bitmap)
                              │                                      │
                              └───────────────┬──────────────────────┘
                                              ▼
                               (composite path: createCompositeImage)
                                              │
                                              ▼
                                       sendBack ─▶ caller
```

### Proposed flow

```
call site ──▶ resolves overlay {filePath, iconKey}  ──▶ ScreenshotOptions.overlay
       │
       ▼
screenshotRequestMachine ──▶ screenshotCapabilityMachine
                                                 │
                             ┌───────────────────┴──────────────────┐
                             ▼                                      ▼
                   captureScreenshots                       captureSvgScreenshots
                             │                                      │
                             ▼                                      ▼
              draw scene ─▶ blit to 2D canvas      draw scene to 2D canvas
                             │                                      │
                             ▼                                      ▼
              drawScreenshotOverlay (single-view path only)
                             │                                      │
                             ▼                                      ▼
                         toDataURL                              toDataURL
                             │                                      │
                             └───────────────┬──────────────────────┘
                                             ▼
                              composite path: createCompositeImage
                                             │
                                             ▼
                              drawScreenshotOverlay (composite path only)
                                             │
                                             ▼
                                    sendBack ─▶ caller
```

The single-view and composite branches share the same `drawScreenshotOverlay` helper but differ in _when_ it runs (per-angle vs once on the composite canvas).

## References

- Existing centralisation: `apps/ui/app/machines/screenshot-capability.machine.ts`
- Existing chip implementation: `apps/ui/app/components/chat/context-chip.tsx`
- File-extension icon resolver: `apps/ui/app/components/icons/file-extension-icon.tsx`
- SVG sprite type union: `apps/ui/app/components/icons/generated/svg-icons.d.ts`
- File-path source: `apps/ui/app/machines/cad.machine.ts` (`CadContext.file`)
- Color token: `apps/ui/app/styles/global.css:245`
- Web research:
  - [SVG to Canvas best practices (2026)](https://www.sammapix.com/blog/svg-to-png-complete-guide-developers)
  - [How to draw `xlink:href` to canvas (StackOverflow Q53363289)](https://stackoverflow.com/questions/53363289/how-to-draw-xlinkhref-to-canvas)
  - [HTML Canvas font property practical guide (2026)](https://thelinuxcode.com/html-canvas-font-property-a-practical-production-ready-guide-2026/)
  - [`FontFace.load()` MDN](https://developer.mozilla.org/docs/Web/API/FontFace/load)
  - [Canvas 2D color serialization (whatwg/html#8917)](https://github.com/whatwg/html/issues/8917)
  - [`oklch()` Baseline status](https://caniuse.com/mdn-css_types_color_oklch)
  - [Tainted Canvas due to CORS and SVG (StackOverflow Q20584355)](https://stackoverflow.com/questions/20584355/tainted-canvas-due-to-cors-and-svg)
- Related research: `docs/research/screenshot-viewport-shared-material-state-bleed.md` (canonical reference for the screenshot pipeline's renderer-isolation contract — overlay must respect this and not introduce shared state).

## Appendix A — Per-call-site change inventory

| Call site                                                                                     | Current arg surface                              | New plumbing                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ui/app/components/geometry/cad/capture-view-control.tsx` (`CaptureViewControl`)         | `useGraphics()`, `useChatActions()`              | Add `useCad()`, read `file?.path`, pass `overlay` to `captureViewScreenshot`                                                    |
| `apps/ui/app/components/geometry/cad/capture-view-control.tsx` (`CaptureViewOverflowControl`) | same                                             | same                                                                                                                            |
| `apps/ui/app/components/chat/chat-textarea.tsx` (drag-drop, Camera, `@`-suggestion)           | builds options inline                            | resolve `cadRef` from the dropped pane's `GraphicsProvider`/`CadProvider`; for `@`-suggestion, use the active viewer's `cadRef` |
| `apps/ui/app/routes/projects_.$id/project-command-items.tsx`                                  | dispatches `requestScreenshot` directly          | read active `cadRef`, attach overlay                                                                                            |
| `apps/ui/app/components/chat/chat-context-actions.tsx` (orthographic batch)                   | dispatches `requestCompositeScreenshot` directly | read active `cadRef`, attach overlay                                                                                            |
| `apps/ui/app/hooks/rpc-handlers.ts` (agent RPC `capture_screenshot`)                          | takes `filePath` from agent tool input           | use the agent-supplied path directly as `overlay.filePath`                                                                      |

## Appendix B — Risks and mitigations

| Risk                                                    | Mitigation                                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold-start font race produces wrong typeface            | `ensureChipFontLoaded()` awaits `document.fonts.load(...)` once per page.                                                                                                                                  |
| SVG sprite query returns null in test env               | Fall back to lucide `File` icon (already the rendering fallback in `file-extension-icon.tsx`).                                                                                                             |
| Long path overflows visible chip area                   | Left-truncation with ellipsis prefix, capped at `min(canvas_width × 0.6, 480px)`.                                                                                                                          |
| Composite double-stamping                               | Suppress per-angle overlay when called from composite actor (`__suppressOverlay` private flag), draw single chip on composite canvas after grid assembly.                                                  |
| Agent screenshots include chip the agent didn't ask for | Default-on with explicit `overlay: undefined` opt-out for agent RPC; document in `agent-screenshot-rpc-resize-audit.md` follow-up.                                                                         |
| Visual regression vs in-DOM chip                        | E2E test compares ΔE colour at known coordinate; visual QA on Chrome+Safari+Firefox before merge.                                                                                                          |
| OKLCH not honoured in some headless test runner         | Same fallback path as #2 above; the linear hex equivalent of `oklch(60.29% 0.1875 289.06)` (~`#7B3CD9`) can be hard-coded as a secondary `fillStyle` if needed (verified by Polypane / Coolors converter). |
