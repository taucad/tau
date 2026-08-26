// Ensure CJS globals are available when OpenCASCADE WASM modules
// are loaded in ESM context by tsx/vitest transformers.

if (globalThis.__dirname === undefined) {
  globalThis.__dirname = __dirname;
}

if (globalThis.__filename === undefined) {
  globalThis.__filename = __filename;
}

if (globalThis.fetch === undefined) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- CJS shim, not in async context
  globalThis.fetch = () => Promise.reject(new Error('fetch not available'));
}
