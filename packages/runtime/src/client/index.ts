/* oxlint-disable no-barrel-files/no-barrel-files -- browser-safe public client subpath */

/**
 * Browser-safe runtime client entry.
 *
 * This subpath deliberately requires an explicit transport. It reuses the
 * runtime client implementation without importing the package-root
 * in-process fallback.
 *
 * @public
 */

export {
  RenderTimeoutError,
  isRenderTimeoutError,
  RenderAbortedError,
  isRenderAbortedError,
} from '#framework/runtime-worker-client.js';
export * from '#client/runtime-client-core.js';
