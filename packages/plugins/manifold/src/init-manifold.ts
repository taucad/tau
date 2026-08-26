import { setWasmUrl } from 'manifold-3d/lib/wasm.js';
import { resolveWasmUrl } from '@taucad/runtime/kernel';

const defaultManifoldWasmUrl = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;

/**
 * Configure the Manifold WASM module URL before any initialization.
 * Must be called before importing `manifold-3d/manifoldCAD` (which triggers
 * a top-level `await getManifoldModule()` that uses this URL via `locateFile`).
 *
 * @param wasmUrl - Optional override URL. When omitted the bundler-friendly
 *   default (`manifold-3d/manifold.wasm`) package export is used.
 */
export function initManifoldWasm(wasmUrl?: string): void {
  setWasmUrl(resolveWasmUrl(defaultManifoldWasmUrl, wasmUrl));
}
