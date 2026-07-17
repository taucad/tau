/**
 * Returns the assimpjs Emscripten factory regardless of module interop.
 *
 * The assimpjs dist files use ESM syntax but the package declares no
 * `"type": "module"`, so Node's ESM loader classifies them as CommonJS and a
 * default import surfaces as a namespace-like `{ default: factory }` object,
 * while Vite and browser bundlers surface the factory function directly.
 */
export const resolveAssimpFactory = <Factory extends (...args: never[]) => unknown>(imported: Factory): Factory =>
  typeof imported === 'function' ? imported : (imported as unknown as { default: Factory }).default;
