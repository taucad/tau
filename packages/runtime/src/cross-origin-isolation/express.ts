/**
 * Express/Connect adapter for `@taucad/runtime/cross-origin-isolation`.
 *
 * Provides {@link coiMiddleware}, an Express-compatible middleware that
 * applies the canonical {@link documentHeaders} to every response on the
 * Express app. Mount it BEFORE any `express.static` (or other response
 * producer) so worker scripts and WASM responses carry the headers Safari
 * requires under `Cross-Origin-Embedder-Policy: require-corp`.
 *
 * The contract here is duplicated from `../cross-origin-isolation/index.ts`
 * via import (no string duplication) and guarded by the parity test in
 * `express.test.ts`. `@types/express` is an optional peer dependency — when
 * missing, the duck-typed local interfaces below keep the package consumable
 * by Connect-style stacks (Express 4/5, Polka, Tinyhttp, etc.).
 *
 * @public
 *
 * @see {@link documentHeaders}
 *
 * @example <caption>Mount on an Express app before static assets</caption>
 * ```typescript
 * import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';
 *
 * declare const app: { use: (handler: ReturnType<typeof coiMiddleware>) => void };
 * app.use(coiMiddleware());
 * ```
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { documentHeaders } from '#cross-origin-isolation/index.js';

/**
 * Subset of Express's `Response` we touch. `ServerResponse` from `node:http`
 * provides `setHeader`; Express adds `append`. Typing it as optional keeps the
 * adapter usable on raw Node servers (Polka, Tinyhttp, etc.).
 */
type CoiServerResponse = ServerResponse & {
  append?: (name: string, value?: string | string[]) => unknown;
};

type CoiNextFunction = (error?: unknown) => void;

type CoiMiddleware = (request: IncomingMessage, response: CoiServerResponse, next: CoiNextFunction) => void;

const coiHeaderNamesLc: ReadonlySet<string> = new Set(Object.keys(documentHeaders).map((name) => name.toLowerCase()));

/**
 * Express-compatible middleware factory that applies the canonical
 * {@link documentHeaders} (COOP, COEP, CORP) to every response.
 *
 * The returned function matches the Express/Connect middleware signature
 * `(req, res, next)`. Mount it before any static-asset middleware so worker
 * scripts and WASM responses carry the headers Safari requires under
 * `Cross-Origin-Embedder-Policy: require-corp`.
 *
 * @returns A middleware function with the standard `(request, response, next)` signature.
 *
 * @public
 *
 * @example <caption>Use as a Connect-style middleware</caption>
 * ```typescript
 * import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';
 *
 * const middleware = coiMiddleware();
 * declare const app: { use: (handler: typeof middleware) => void };
 * app.use(middleware);
 * ```
 */
export function coiMiddleware(): CoiMiddleware {
  return (_request, response, next) => {
    for (const [name, value] of Object.entries(documentHeaders)) {
      response.setHeader(name, value);
    }
    suppressDownstreamCoiAppends(response);
    next();
  };
}

/**
 * Override `response.append(name, value)` for COI headers so downstream
 * handlers (notably `@react-router/express`, which writes a React Router
 * `Response` to Express via `res.append(name, value)`) cannot duplicate the
 * single-value COOP/COEP/CORP headers we just set.
 *
 * COOP, COEP, and CORP are single-value headers per the HTTP spec; appending
 * a second value yields invalid output like `"same-origin, same-origin"`,
 * which Safari treats as a malformed isolation declaration. Express's
 * `res.append` is opt-in for multi-value headers (e.g. `Set-Cookie`) and is
 * the wrong primitive for single-value response headers.
 *
 * @param response - The response object to harden against duplicate COI appends.
 * @returns void
 */
function suppressDownstreamCoiAppends(response: CoiServerResponse): void {
  const original = response.append;
  if (typeof original !== 'function') {
    return;
  }
  /**
   * @param name - Header name.
   * @param value - Header value.
   * @returns The underlying response.
   */
  response.append = (name: string, value?: string | string[]) => {
    if (typeof name === 'string' && coiHeaderNamesLc.has(name.toLowerCase())) {
      return response;
    }
    return original.call(response, name, value);
  };
}
