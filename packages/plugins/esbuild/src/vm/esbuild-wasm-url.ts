/** Browser URL for the esbuild WebAssembly fallback. */

export const esbuildWasmUrl = new URL('wasm/esbuild.wasm', import.meta.url).href;
