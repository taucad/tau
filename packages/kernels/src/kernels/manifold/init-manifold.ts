import { setWasmUrl } from 'manifold-3d/lib/wasm.js';
import { resolveWasmUrl } from '#framework/wasm-url.js';

const defaultManifoldWasmUrl = new URL('wasm/manifold.wasm', import.meta.url).href;

/**
 * Configure the Manifold WASM module URL before any initialization.
 * Must be called before importing `manifold-3d/manifoldCAD` (which triggers
 * a top-level `await getManifoldModule()` that uses this URL via `locateFile`).
 *
 * @param wasmUrl - Optional override URL. When omitted the bundler-friendly
 *   default (`new URL('wasm/manifold.wasm', import.meta.url).href`) is used.
 */
export function initManifoldWasm(wasmUrl?: string): void {
  setWasmUrl(resolveWasmUrl(defaultManifoldWasmUrl, wasmUrl));
}
