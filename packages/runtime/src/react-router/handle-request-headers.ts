/**
 * React Router v7 integrations for `@taucad/runtime` consumers.
 *
 * This namespace hosts framework-specific helpers. Low-level primitives are
 * re-exported from `@taucad/runtime/cross-origin-isolation`; this module adds
 * idiomatic shapes for the React Router SSR contract.
 *
 * @public
 *
 * @see https://reactrouter.com/api/framework-conventions/entry.server.tsx
 */

import { applyDocumentHeaders } from '#cross-origin-isolation/index.js';

/**
 * Apply cross-origin isolation headers to the `responseHeaders` parameter
 * passed into React Router v7's `handleRequest` default export. Call this
 * before returning the streamed `Response` so every SSR document carries COOP,
 * COEP, and CORP.
 *
 * @param responseHeaders - The `Headers` instance supplied by React Router.
 *
 * @public
 *
 * @example <caption>Wire into the RR v7 handleRequest default export</caption>
 * ```typescript
 * import { applyHandleRequestHeaders } from '@taucad/runtime/react-router';
 *
 * export default function handleRequest(
 *   request: Request,
 *   responseStatusCode: number,
 *   responseHeaders: Headers,
 * ) {
 *   applyHandleRequestHeaders(responseHeaders);
 *   // ... existing renderToReadableStream flow
 *   return new Response('<!doctype html>', { headers: responseHeaders, status: responseStatusCode });
 * }
 * ```
 */
export function applyHandleRequestHeaders(responseHeaders: Headers): void {
  applyDocumentHeaders(responseHeaders);
}
