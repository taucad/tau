/**
 * Board-layer rasterizer that `circuit-json-to-gltf` loads in place of its own `svg-to-png` chunks.
 *
 * The converter picks a chunk by realm: the native one (`@resvg/resvg-js` and `Buffer`) wherever `document` is
 * undefined, which includes the kernel worker, and a browser one that fetches `resvg-wasm` while the kernel's offline
 * fetch trap is installed. Neither can draw a board texture in the worker, so the converter silently falls back to a
 * flat board colour. Every bundler that composes the kernel redirects both chunks here: `tsdown.engine.ts` for the
 * published engine, and the UI's Vite alias for builds from source. The kernel hands the compiled WASM to
 * {@link loadBoardTextureRenderer} before conversion starts, so rasterizing never fetches.
 */

import type { Resvg as ResvgType } from '@resvg/resvg-wasm';
// oxlint-disable-next-line import/extensions, import/no-unassigned-import -- Pinned converter chunk; see the declaration.
import { tscircuit_font_default as tscircuitFontBase64 } from 'circuit-json-to-gltf/dist/chunk-W5ZY3YD5.js';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';

type Renderer = { readonly resvgConstructor: typeof ResvgType; readonly font: Uint8Array<ArrayBuffer> };
type RendererSlot = { renderer?: Promise<Renderer> };

/**
 * One renderer per realm, kept on `globalThis` rather than in module state: a dev server can pre-bundle a second copy
 * of this module into the converter's optimized dependency, and that copy must rasterize with the WASM the kernel
 * loaded through the first.
 */
const rendererSlotKey = Symbol.for('taucad.tscircuit.boardTextureRenderer');
const slot = (): RendererSlot => {
  const existing: unknown = Reflect.get(globalThis, rendererSlotKey);
  if (existing !== undefined) {
    return existing as RendererSlot;
  }
  const created: RendererSlot = {};
  Reflect.set(globalThis, rendererSlotKey, created);
  return created;
};

/**
 * Initialize resvg once per realm. The kernel compiles the WASM, a package asset rather than a board resource, which
 * its offline fetch trap lets through; only the first call's module is used.
 * @param wasm - The compiled `@resvg/resvg-wasm/index_bg.wasm`.
 * @returns Resolves when {@link svgToPngDataUrl} can rasterize without fetching.
 */
export const loadBoardTextureRenderer = async (wasm: WebAssembly.Module): Promise<void> => {
  const current = slot();
  current.renderer ??= (async () => {
    const resvg = await import('@resvg/resvg-wasm');
    try {
      await resvg.initWasm(wasm);
    } catch (error) {
      // Another copy of this module in the same realm may have initialized the shared WASM instance.
      if (!String(error).includes('Already initialized')) {
        throw error;
      }
    }
    return { resvgConstructor: resvg.Resvg, font: base64ToUint8Array(tscircuitFontBase64) };
  })();
  try {
    await current.renderer;
  } catch (error) {
    current.renderer = undefined;
    throw error;
  }
};

/** Options `circuit-json-to-gltf` passes to its `svg-to-png` chunks. */
type SvgToPngOptions = { readonly width?: number; readonly height?: number; readonly background?: string };

const fitTo = ({ width, height }: SvgToPngOptions) => {
  if (width) {
    return { mode: 'width', value: width } as const;
  }
  if (height) {
    return { mode: 'height', value: height } as const;
  }
  return undefined;
};

/**
 * Rasterize one board layer, with the converter's font, to a PNG data URL.
 * @param svg - The layer SVG from `circuit-to-svg`.
 * @param options - Target size and background colour.
 * @returns A `data:image/png;base64,` URL.
 */
export const svgToPngDataUrl = async (svg: string, options: SvgToPngOptions = {}): Promise<string> => {
  const { renderer } = slot();
  if (!renderer) {
    throw new Error('Board texture renderer used before loadBoardTextureRenderer().');
  }
  const { resvgConstructor, font } = await renderer;
  // oxlint-disable-next-line new-cap -- The dynamically imported class is held in a camel-case variable by naming policy.
  const resvg = new resvgConstructor(svg, {
    background: options.background,
    fitTo: fitTo(options),
    font: {
      loadSystemFonts: false,
      fontBuffers: [font],
      defaultFontFamily: 'TscircuitAlphabet',
      monospaceFamily: 'TscircuitAlphabet',
      sansSerifFamily: 'TscircuitAlphabet',
    },
  });
  try {
    const rendered = resvg.render();
    try {
      return `data:image/png;base64,${uint8ArrayToBase64(rendered.asPng())}`;
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
};
