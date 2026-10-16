/** Browser URL for the esbuild WebAssembly fallback. */

export const esbuildWasmUrl = new URL(import.meta.resolve('./wasm/esbuild.wasm')).href;
