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
 *
 * @param defaultUrl - bundler-friendly default URL (typically from `import.meta.url`)
 * @param override - optional runtime override for testing or custom builds
 * @returns the resolved WASM URL
 * @public
 */
export function resolveWasmUrl(defaultUrl: string, override?: string): string {
  return override ?? defaultUrl;
}
