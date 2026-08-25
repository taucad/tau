/**
 * TypeScript's DOM lib does not expose `WebAssembly.Exception` in every target,
 * but browsers and Node versions that support native WASM exceptions provide it
 * at runtime. Keep the check structural so browser-safe graphs do not depend on
 * ambient lib upgrades.
 */

/**
 * @public
 */
export type WebAssemblyException = Record<string, unknown>;

type WebAssemblyExceptionConstructor = new (...args: never[]) => WebAssemblyException;

type WebAssemblyWithException = typeof WebAssembly & {
  Exception?: WebAssemblyExceptionConstructor;
};

/**
 * @public
 */
export function getWebAssemblyExceptionConstructor(): WebAssemblyExceptionConstructor | undefined {
  if (typeof WebAssembly === 'undefined') {
    return undefined;
  }

  const candidate = (WebAssembly as WebAssemblyWithException).Exception;
  return typeof candidate === 'function' ? candidate : undefined;
}

/**
 * @public
 */
export function isWebAssemblyException(error: unknown): error is WebAssemblyException {
  const exceptionConstructor = getWebAssemblyExceptionConstructor();
  return exceptionConstructor !== undefined && error instanceof exceptionConstructor;
}
