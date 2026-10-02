import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeChipLayout,
  truncateFromLeft,
  ensureChipFontLoaded,
  getIconImage,
  wrapSymbolAsStandaloneSvg,
  drawScreenshotOverlay,
  __resetScreenshotOverlayCacheForTests,
} from '#machines/screenshot-overlay.utils.js';

// ---------------------------------------------------------------------------
// `truncateFromLeft`
// ---------------------------------------------------------------------------

describe('truncateFromLeft', () => {
  // Stub measurer where each character is 10px wide (`…` also 10px) — keeps
  // assertions trivial and avoids depending on any real font metrics.
  const measurerForCharWidth = (charWidthPx: number) => ({
    measureText: (text: string): { width: number } => ({ width: text.length * charWidthPx }),
  });

  it('returns the original text when it already fits', () => {
    const context = measurerForCharWidth(10);
    expect(truncateFromLeft(context, 'main.scad', 1000)).toBe('main.scad');
  });

  it('returns an empty string unchanged', () => {
    const context = measurerForCharWidth(10);
    expect(truncateFromLeft(context, '', 50)).toBe('');
  });

  it('prefixes an ellipsis and trims from the LEFT, keeping the filename intact', () => {
    const context = measurerForCharWidth(10);
    // Path is 30 chars wide (300px). Cap at 110px should retain only the
    // tail that fits with a leading `…`. (`…` + 10 chars = 11 chars = 110px).
    const truncated = truncateFromLeft(context, 'src/components/chat/main.scad', 110);
    expect(truncated.startsWith('…')).toBe(true);
    expect(truncated.endsWith('main.scad')).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(11);
  });

  it('returns at least the ellipsis when nothing fits', () => {
    const context = measurerForCharWidth(10);
    const truncated = truncateFromLeft(context, 'irrelevant', 1);
    expect(truncated).toBe('…');
  });
});

// ---------------------------------------------------------------------------
// `wrapSymbolAsStandaloneSvg`
// ---------------------------------------------------------------------------

describe('wrapSymbolAsStandaloneSvg', () => {
  it('rewraps a sprite symbol as a standalone svg with the requested pixel size', () => {
    const symbol = createSymbolElement({ id: 'openscad', viewBox: '0 0 32 32', innerHtml: '<path d="M0 0"/>' });
    const result = wrapSymbolAsStandaloneSvg(symbol, 24);
    expect(result).toContain('width="24"');
    expect(result).toContain('height="24"');
    expect(result).toContain('viewBox="0 0 32 32"');
    // The jsdom innerHTML serialiser may expand self-closing tags into open+close.
    expect(result).toMatch(/<path\s+d="M0 0"\s*\/>|<path\s+d="M0 0"><\/path>/);
  });

  it('falls back to a default viewBox when the symbol omits one', () => {
    const symbol = createSymbolElement({ id: 'noviewbox', viewBox: undefined, innerHtml: '<g/>' });
    const result = wrapSymbolAsStandaloneSvg(symbol, 16);
    expect(result).toContain('viewBox="0 0 56 56"');
  });
});

// ---------------------------------------------------------------------------
// `computeChipLayout`
// ---------------------------------------------------------------------------

describe('computeChipLayout', () => {
  function createMockContext(charWidthPx: number): CanvasRenderingContext2D {
    return {
      font: '',
      measureText: (text: string) => ({ width: text.length * charWidthPx }),
    } as unknown as CanvasRenderingContext2D;
  }

  it('sizes the chip to the displayed text plus padding, icon, and gap', () => {
    const context = createMockContext(8);
    const layout = computeChipLayout(context, { cssWidth: 1200, filePath: 'main.scad' });
    // PadX*2 (20) + iconSize (16) + iconGap (6) + textWidth (9 chars * 8px = 72) = 114
    expect(layout.chipWidth).toBe(20 + 16 + 6 + 72);
    expect(layout.chipHeight).toBe(6 * 2 + 16);
    expect(layout.chipX).toBe(12);
    expect(layout.chipY).toBe(12);
    expect(layout.displayedText).toBe('main.scad');
  });

  it('truncates very long paths to fit the cap', () => {
    const context = createMockContext(20);
    const longPath = 'a/very/very/very/long/path/to/the/main.scad';
    const layout = computeChipLayout(context, { cssWidth: 1200, filePath: longPath });
    expect(layout.displayedText.startsWith('…')).toBe(true);
    expect(layout.displayedText.endsWith('main.scad')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// `ensureChipFontLoaded` (memoisation)
// ---------------------------------------------------------------------------

describe('ensureChipFontLoaded', () => {
  beforeEach(() => {
    __resetScreenshotOverlayCacheForTests();
    installFakeDocumentFonts();
  });

  afterEach(() => {
    restoreDocumentFonts();
  });

  it('calls document.fonts.load exactly once across multiple invocations', async () => {
    const loadSpy = vi.spyOn(document.fonts, 'load').mockResolvedValue([]);

    await ensureChipFontLoaded();
    await ensureChipFontLoaded();
    await ensureChipFontLoaded();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy.mock.calls[0]?.[0]).toContain('Geist Sans');
  });

  it('swallows font-load failures so the screenshot pipeline never breaks', async () => {
    vi.spyOn(document.fonts, 'load').mockRejectedValue(new Error('font load failed'));
    await expect(ensureChipFontLoaded()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// `getIconImage` (sprite extraction + fallback)
// ---------------------------------------------------------------------------

describe('getIconImage', () => {
  beforeEach(() => {
    __resetScreenshotOverlayCacheForTests();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined gracefully when the sprite symbol is missing (jsdom fallback path)', async () => {
    // The jsdom Image element resolves `src=` synchronously without firing
    // load — stub `decode` to bypass the wait.
    stubImageDecode();

    const image = await getIconImage('does-not-exist', 16);
    // Either resolves to a fallback icon OR returns undefined cleanly —
    // never throws. Tolerate both because jsdom's <img> + data-URL handling
    // is permissive but not pixel-accurate.
    expect(image === undefined || image instanceof globalThis.Image).toBe(true);
  });

  it('caches per (iconKey, size) so a second call does not re-load', async () => {
    stubImageDecode();
    const querySpy = vi.spyOn(document, 'querySelector');

    await getIconImage('openscad', 16);
    await getIconImage('openscad', 16);

    // The second call should hit the cache and skip the symbol query.
    expect(querySpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// `drawScreenshotOverlay` — high-level smoke test
// ---------------------------------------------------------------------------

describe('drawScreenshotOverlay', () => {
  beforeEach(() => {
    __resetScreenshotOverlayCacheForTests();
    installFakeDocumentFonts();
    vi.spyOn(document.fonts, 'load').mockResolvedValue([]);
    stubImageDecode();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreDocumentFonts();
  });

  it('runs the full draw pipeline on a mock 2D context without throwing', async () => {
    const context = createSpyCanvasContext();
    await drawScreenshotOverlay(context, {
      canvasWidth: 1200,
      canvasHeight: 675,
      pixelRatio: 1,
      overlay: { filePath: 'src/main.scad', iconKey: 'openscad' },
    });

    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(context.scale).toHaveBeenCalledWith(1, 1);
    expect(context.fillText).toHaveBeenCalled();
    expect(context.fillText.mock.calls[0]?.[0]).toContain('main.scad');
  });

  it('no-ops gracefully when canvasWidth is zero', async () => {
    const context = createSpyCanvasContext();
    await drawScreenshotOverlay(context, {
      canvasWidth: 0,
      canvasHeight: 0,
      pixelRatio: 1,
      overlay: { filePath: 'main.scad' },
    });
    expect(context.save).not.toHaveBeenCalled();
  });

  it('scales the context by pixelRatio for HiDPI canvases', async () => {
    const context = createSpyCanvasContext();
    await drawScreenshotOverlay(context, {
      canvasWidth: 2400,
      canvasHeight: 1350,
      pixelRatio: 2,
      overlay: { filePath: 'main.scad' },
    });
    expect(context.scale).toHaveBeenCalledWith(2, 2);
  });

  it('forces chip draw-state defaults even when caller pre-poisoned the context', async () => {
    // Regression: `createCompositeImage`'s tile-label block historically
    // leaked `textAlign='center'` into the bare context, then called
    // `drawScreenshotOverlay`, which inherited the alignment and painted
    // chip text on top of the icon. The helper now owns its own state.
    const context = createSpyCanvasContext();
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.direction = 'rtl';
    context.globalAlpha = 0.3;
    context.globalCompositeOperation = 'multiply';
    context.filter = 'blur(2px)';

    // Capture the helper's draw-state at the moment text is painted —
    // restore() runs after, so we can't inspect post-call.
    const observed: Partial<DrawStateSnapshot> = {};
    context.fillText = vi.fn(() => {
      observed.textAlign = context.textAlign;
      observed.textBaseline = context.textBaseline;
      observed.direction = context.direction;
      observed.globalAlpha = context.globalAlpha;
      observed.globalCompositeOperation = context.globalCompositeOperation;
      observed.filter = context.filter;
      observed.fillStyle = context.fillStyle;
      observed.font = context.font;
    });

    await drawScreenshotOverlay(context, {
      canvasWidth: 800,
      canvasHeight: 600,
      pixelRatio: 1,
      overlay: { filePath: 'main.ts', iconKey: 'typescript' },
    });

    expect(observed.textAlign).toBe('left');
    expect(observed.textBaseline).toBe('middle');
    expect(observed.direction).toBe('ltr');
    expect(observed.globalAlpha).toBe(1);
    expect(observed.globalCompositeOperation).toBe('source-over');
    expect(observed.filter).toBe('none');
    expect(observed.fillStyle).not.toBe('');
    expect(observed.font).toContain('Geist Sans');
  });

  it('restores caller draw-state after drawing (save/restore symmetry)', async () => {
    // Locks in the second half of the state-ownership contract: the helper
    // does NOT leak any of its writes back to the caller. Uses the spy's
    // snapshot-capable save/restore to actually round-trip state.
    const context = createSpyCanvasContext();
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#000000';
    context.strokeStyle = '#abcdef';
    context.font = 'bold 18px Arial';
    context.globalAlpha = 0.5;
    context.globalCompositeOperation = 'multiply';
    context.filter = 'sepia(1)';
    context.direction = 'rtl';

    await drawScreenshotOverlay(context, {
      canvasWidth: 800,
      canvasHeight: 600,
      pixelRatio: 1,
      overlay: { filePath: 'main.ts', iconKey: 'typescript' },
    });

    expect(context.textAlign).toBe('center');
    expect(context.textBaseline).toBe('alphabetic');
    expect(context.fillStyle).toBe('#000000');
    expect(context.strokeStyle).toBe('#abcdef');
    expect(context.font).toBe('bold 18px Arial');
    expect(context.globalAlpha).toBe(0.5);
    expect(context.globalCompositeOperation).toBe('multiply');
    expect(context.filter).toBe('sepia(1)');
    expect(context.direction).toBe('rtl');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSymbolElement(args: { id: string; viewBox: string | undefined; innerHtml: string }): Element {
  const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
  symbol.setAttribute('id', args.id);
  if (args.viewBox !== undefined) {
    symbol.setAttribute('viewBox', args.viewBox);
  }
  symbol.innerHTML = args.innerHtml;
  return symbol;
}

function stubImageDecode(): void {
  // The jsdom HTMLImageElement does not auto-fire `load` for data: URLs;
  // override `decode` so the overlay helper resolves immediately.
  Object.defineProperty(globalThis.Image.prototype, 'decode', {
    configurable: true,
    value: async (): Promise<void> => undefined,
  });
}

let originalDocumentFonts: PropertyDescriptor | undefined;

function installFakeDocumentFonts(): void {
  if (typeof document === 'undefined') {
    return;
  }
  originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  if (originalDocumentFonts === undefined || !('load' in (originalDocumentFonts.value ?? {}))) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      writable: true,
      value: {
        load: async (): Promise<FontFace[]> => [],
      },
    });
  }
}

function restoreDocumentFonts(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (originalDocumentFonts) {
    Object.defineProperty(document, 'fonts', originalDocumentFonts);
  } else {
    delete (document as unknown as { fonts?: unknown }).fonts;
  }
  originalDocumentFonts = undefined;
}

type DrawStateSnapshot = {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  textAlign: string;
  textBaseline: string;
  direction: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
};

type SpyContext = DrawStateSnapshot & {
  measureText: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  roundRect: ReturnType<typeof vi.fn>;
};

/**
 * Spy context whose `save`/`restore` actually snapshot and roll back every
 * draw-state property. Lets tests assert (a) what the helper writes inside
 * its save/restore block (via observers like a `fillText` interceptor) and
 * (b) that caller state is restored verbatim afterwards (symmetry test).
 */
function createSpyCanvasContext(): SpyContext & CanvasRenderingContext2D {
  const stack: DrawStateSnapshot[] = [];
  const context: SpyContext = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
  };
  context.save = vi.fn(() => {
    stack.push({
      font: context.font,
      fillStyle: context.fillStyle,
      strokeStyle: context.strokeStyle,
      textAlign: context.textAlign,
      textBaseline: context.textBaseline,
      direction: context.direction,
      globalAlpha: context.globalAlpha,
      globalCompositeOperation: context.globalCompositeOperation,
      filter: context.filter,
    });
  });
  context.restore = vi.fn(() => {
    const snap = stack.pop();
    if (snap) {
      Object.assign(context, snap);
    }
  });
  return context as unknown as SpyContext & CanvasRenderingContext2D;
}
