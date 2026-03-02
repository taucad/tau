/**
 * Shared WASM URL resolution utility.
 *
 * Implements the ES Module injection pattern: use a bundler-friendly
 * default URL (typically `new URL('...', import.meta.url).href`) but
 * allow runtime callers to override it for testing, benchmarking,
 * or custom builds.
 *
 * @see docs/policy/es-module-policy.md
 */

/**
 * Return `override` when provided, otherwise fall back to `defaultUrl`.
 *
 * This trivial wrapper documents the injection pattern and provides
 * a single place to add logging, validation, or telemetry in the future.
 */
export function resolveWasmUrl(defaultUrl: string, override?: string): string {
  return override ?? defaultUrl;
}
