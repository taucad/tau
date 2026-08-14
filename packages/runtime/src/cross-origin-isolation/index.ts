/**
 * Canonical cross-origin isolation headers and runtime helpers.
 *
 * Consumers of `@taucad/runtime` that need `SharedArrayBuffer` (geometry pool,
 * signal-buffer abort channel, multi-threaded WASM) must serve a
 * `crossOriginIsolated` document. This module is the single source of truth for
 * the header set — every framework adapter (`@taucad/runtime/vite`,
 * `@taucad/runtime/react-router`, …) depends on it.
 *
 * @public
 *
 * @see https://web.dev/articles/coop-coep
 *
 * @example <caption>Set headers on a `Response`</caption>
 * ```typescript
 * import { applyDocumentHeaders } from '@taucad/runtime/cross-origin-isolation';
 *
 * const response = new Response('<!doctype html>…');
 * applyDocumentHeaders(response.headers);
 * ```
 */

export {
  apiHeaders,
  applyApiHeaders,
  applyDocumentHeaders,
  applySubresourceHeaders,
  documentHeaders,
  subresourceHeaders,
} from '#cross-origin-isolation/headers.js';
export type { IsolationFailureReason, IsolationStatus } from '#cross-origin-isolation/headers.js';
