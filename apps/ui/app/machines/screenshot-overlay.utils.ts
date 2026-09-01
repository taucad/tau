import type { ScreenshotOverlay } from '@taucad/types';

/**
 * Pure rendering helpers that stamp a top-left chip (file-extension icon +
 * full file path) onto an arbitrary 2D canvas.
 *
 * Every screenshot the editor produces flows through
 * `screenshot-capability.machine.ts`. This module is the single rendering
 * surface that turns a {@link ScreenshotOverlay} into pixels — the machine
 * delegates here so all entry points (chat composer, viewer toolbar,
 * command palette, agent RPC, composite multi-angle) produce a visually
 * identical chip without per-call-site stamping.
 *
 * State-ownership contract: {@link drawScreenshotOverlay} owns every
 * draw-state property it touches inside its `save`/`restore` block. Callers
 * do NOT need to clean up before invoking, and the helper does NOT leak any
 * state after returning. This is the architectural defence against the
 * `CanvasRenderingContext2D` global-mutable-state foot-gun — see the
 * `composite path leak` regression for prior art.
 *
 * See `docs/research/screenshot-overlay-watermark-architecture.md` for the
 * design rationale (Findings 4–10) and visual spec (Finding 9).
 */

// ---------------------------------------------------------------------------
// Visual spec — fully opaque chat-purple pill with white text. Mirrors the
// `<Badge variant="release">` / primary-button palette so the overlay reads
// as a first-class purple chip rather than a translucent watermark that
// blends with the rendered scene behind it.
// ---------------------------------------------------------------------------

const chipFillStyle = 'oklch(60.29% 0.1875 289.06)';
const chipTextStyle = '#ffffff';
const chipFont = '500 14px "Geist Sans", system-ui, sans-serif';
const chipFontShorthand = '500 14px "Geist Sans"';

const chipMargin = 12;
const chipPaddingX = 10;
const chipPaddingY = 6;
const chipIconSize = 16;
const chipIconGap = 6;
const chipCornerRadius = 6;
const chipMaxWidthPx = 480;
const chipMaxWidthRatio = 0.6;

// ---------------------------------------------------------------------------
// Font loading
// ---------------------------------------------------------------------------

let fontLoadPromise: Promise<void> | undefined;

async function loadChipFont(): Promise<void> {
  // oxlint-disable-next-line typescript-eslint/no-unnecessary-condition -- defensive runtime guard: SSR (no `document`) and jsdom (no `document.fonts`) both lack the FontFaceSet, even though TS lib.dom types it as always-present
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (fonts === undefined) {
    return;
  }
  try {
    await fonts.load(chipFontShorthand);
  } catch {
    // Swallow — the system fallback is acceptable; we never want overlay
    // failure to break the screenshot pipeline.
  }
}

/**
 * Memoised `document.fonts.load` for the chip font. Browsers defer web-font
 * loading until a glyph is actually needed for paint, so calling
 * `context.fillText` immediately after `context.font = '… "Geist Sans"'` may
 * rasterise with the system fallback on cold loads (e.g. agent RPC firing
 * before any DOM chip has rendered).
 *
 * Resolves once per page; subsequent calls are no-ops.
 */
export async function ensureChipFontLoaded(): Promise<void> {
  fontLoadPromise ??= loadChipFont();
  await fontLoadPromise;
}

// ---------------------------------------------------------------------------
// Icon raster cache
// ---------------------------------------------------------------------------

const iconImageCache = new Map<string, Promise<HTMLImageElement | undefined>>();

/**
 * Inline lucide `File` glyph used when the requested sprite symbol is not
 * present (jsdom tests, unknown extensions, sprite mount race). Encoded as a
 * standalone SVG so it loads via the same data-URL → `Image()` pipeline as
 * sprite extracts.
 */
const fallbackFileIconSvg = (sizePx: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;

/**
 * Resolve an icon-key to a rasterised `HTMLImageElement` ready for
 * `context.drawImage`. Caches the result per `(iconKey, sizePx)` so repeated
 * captures are zero-cost.
 *
 * Sprite icons live inside a single `<svg>` injected by `<SvgSpriteMount />`
 * at the app shell. A `<use href="#id">` reference cannot be drawn via
 * `drawImage` (the spec resolves the fragment against the SVG-as-image's
 * own document, not the host document), so we extract the matching
 * `<symbol id="…">`, rewrap as a standalone `<svg>` of the requested
 * pixel size, encode as a `data:image/svg+xml` URL (origin-clean — no
 * canvas tainting), and wait for `image.decode()` to resolve. See
 * `docs/research/screenshot-overlay-watermark-architecture.md` Finding 4.
 */
export async function getIconImage(iconKey: string | undefined, sizePx: number): Promise<HTMLImageElement | undefined> {
  const cacheKey = `${iconKey ?? '__fallback__'}@${sizePx}`;
  const cached = iconImageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = loadIconImage(iconKey, sizePx);
  iconImageCache.set(cacheKey, promise);
  return promise;
}

async function loadIconImage(iconKey: string | undefined, sizePx: number): Promise<HTMLImageElement | undefined> {
  // oxlint-disable-next-line typescript-eslint/no-unnecessary-condition -- defensive runtime guard for SSR / non-DOM Workers where `Image` is genuinely absent
  if (typeof document === 'undefined' || globalThis.Image === undefined) {
    return undefined;
  }

  const symbol = iconKey ? document.querySelector(`symbol#${cssEscapeId(iconKey)}`) : undefined;
  const svgSource = symbol ? wrapSymbolAsStandaloneSvg(symbol, sizePx) : fallbackFileIconSvg(sizePx);

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`;
  try {
    const image = new globalThis.Image();
    image.src = url;
    if (typeof image.decode === 'function') {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => {
          resolve();
        });
        image.addEventListener('error', () => {
          reject(new Error(`Failed to load overlay icon: ${iconKey ?? '<fallback>'}`));
        });
      });
    }
    return image;
  } catch {
    return undefined;
  }
}

/**
 * Rewrap a sprite `<symbol>` as a standalone `<svg width=… height=…>` so it
 * can be loaded as an `Image` source. Preserves the symbol's `viewBox` so
 * the inner geometry scales correctly into the requested pixel size.
 */
export function wrapSymbolAsStandaloneSvg(symbol: Element, sizePx: number): string {
  const viewBox = symbol.getAttribute('viewBox') ?? '0 0 56 56';
  const inner = symbol.innerHTML;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${viewBox}">${inner}</svg>`;
}

/**
 * Escape an icon id for use inside a CSS selector. `CSS.escape` covers every
 * production case; the manual fallback handles non-DOM environments
 * (Vitest jsdom without `globalThis.CSS`).
 */
function cssEscapeId(id: string): string {
  // oxlint-disable-next-line typescript-eslint/no-unnecessary-condition -- defensive runtime guard for jsdom builds that omit `CSS.escape`
  if (globalThis.CSS !== undefined && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(id);
  }
  return id.replaceAll(/[^\w-]/g, (character) => `\\${character}`);
}

// ---------------------------------------------------------------------------
// Text truncation
// ---------------------------------------------------------------------------

/**
 * Trim `text` from the **left** with a leading ellipsis until the rendered
 * width fits inside `maxWidth`. Mirrors the editor pane's `dir='rtl'`
 * truncation rule (per learned-ui facts) so the most-distinguishing part of
 * a path (filename + parent dir) stays visible: `…/components/chat/main.scad`.
 *
 * `context.font` must be set to the chip font before calling.
 */
export function truncateFromLeft(
  context: { measureText: (text: string) => { width: number } },
  text: string,
  maxWidth: number,
): string {
  if (text.length === 0) {
    return text;
  }
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = '…';
  // Binary search for the longest tail of `text` whose `ellipsis + tail`
  // measurement still fits inside `maxWidth`. Linear search would also work
  // but binary keeps long paths fast.
  let lo = 0;
  let hi = text.length;
  let best = ellipsis;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const tail = text.slice(text.length - mid);
    const candidate = `${ellipsis}${tail}`;
    if (context.measureText(candidate).width <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type ChipLayout = {
  readonly chipX: number;
  readonly chipY: number;
  readonly chipWidth: number;
  readonly chipHeight: number;
  readonly textWidth: number;
  readonly displayedText: string;
};

/**
 * Compute chip dimensions and the truncated displayed text for the supplied
 * canvas dimensions. CSS pixels — DPR scaling is handled by the caller via
 * `context.scale(pixelRatio, pixelRatio)`.
 */
export function computeChipLayout(
  context: CanvasRenderingContext2D,
  args: { readonly cssWidth: number; readonly filePath: string },
): ChipLayout {
  context.font = chipFont;
  const maxTextWidth = Math.max(
    chipIconSize + chipIconGap, // Never shrink narrower than icon-only.
    Math.min(args.cssWidth * chipMaxWidthRatio, chipMaxWidthPx) - chipPaddingX * 2 - chipIconSize - chipIconGap,
  );
  const displayedText = truncateFromLeft(context, args.filePath, maxTextWidth);
  const textWidth = context.measureText(displayedText).width;
  const chipWidth = chipPaddingX * 2 + chipIconSize + chipIconGap + textWidth;
  const chipHeight = chipPaddingY * 2 + Math.max(chipIconSize, 16);
  return {
    chipX: chipMargin,
    chipY: chipMargin,
    chipWidth,
    chipHeight,
    textWidth,
    displayedText,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export type DrawScreenshotOverlayArgs = {
  /** Device-pixel width of the canvas. */
  readonly canvasWidth: number;
  /** Device-pixel height of the canvas. */
  readonly canvasHeight: number;
  /** Device-pixel ratio used by the underlying canvas. CSS-pixel layout uses `canvas / pixelRatio`. */
  readonly pixelRatio: number;
  readonly overlay: ScreenshotOverlay;
};

/**
 * Stamp the chip onto a 2D canvas context. No-op when the document or
 * canvas APIs aren't available (SSR, headless test environments without a
 * canvas mock). Failures during icon loading or font resolution are
 * swallowed — the overlay never breaks the screenshot pipeline.
 *
 * `canvasWidth`/`canvasHeight` are in **device pixels** (i.e. `canvas.width`
 * after `pixelRatio` has been applied). The helper scales the context by
 * `pixelRatio` so all coordinates inside this function reason in CSS pixels
 * — mirrors `captureSvgScreenshots` in `screenshot-capability.machine.ts`.
 */
export async function drawScreenshotOverlay(
  context: CanvasRenderingContext2D,
  args: DrawScreenshotOverlayArgs,
): Promise<void> {
  const { canvasWidth, pixelRatio, overlay } = args;
  if (canvasWidth <= 0 || pixelRatio <= 0) {
    return;
  }

  await ensureChipFontLoaded();

  const cssWidth = canvasWidth / pixelRatio;

  context.save();
  try {
    context.scale(pixelRatio, pixelRatio);

    // Helper owns its draw state — explicit resets so chip rendering is
    // immune to caller-side state poison. See state-ownership contract in
    // the file header. Historical regression: `createCompositeImage`'s
    // tile-label block leaked `textAlign='center'` here, painting chip
    // text on top of the icon.
    context.font = chipFont;
    context.fillStyle = chipFillStyle;
    context.strokeStyle = chipFillStyle;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.direction = 'ltr';
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';

    const layout = computeChipLayout(context, { cssWidth, filePath: overlay.filePath });

    // Background pill
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(layout.chipX, layout.chipY, layout.chipWidth, layout.chipHeight, chipCornerRadius);
    } else {
      // Fallback path for environments without `roundRect` (older jsdom).
      context.rect(layout.chipX, layout.chipY, layout.chipWidth, layout.chipHeight);
    }
    context.fill();

    // Icon
    const iconImage = await getIconImage(overlay.iconKey, chipIconSize);
    if (iconImage) {
      context.drawImage(
        iconImage,
        layout.chipX + chipPaddingX,
        layout.chipY + (layout.chipHeight - chipIconSize) / 2,
        chipIconSize,
        chipIconSize,
      );
    }

    // Text — re-assert font + fillStyle because the awaited `getIconImage`
    // may yield to a sibling overlay draw that mutates this same context
    // (defensive; cheap).
    context.font = chipFont;
    context.fillStyle = chipTextStyle;
    context.fillText(
      layout.displayedText,
      layout.chipX + chipPaddingX + chipIconSize + chipIconGap,
      layout.chipY + layout.chipHeight / 2,
    );
  } finally {
    context.restore();
  }
}

/**
 * Test-only escape hatch — clears the icon cache and re-arms the font load
 * promise so unit tests can exercise cold-load paths in isolation.
 */
export function __resetScreenshotOverlayCacheForTests(): void {
  iconImageCache.clear();
  fontLoadPromise = undefined;
}
