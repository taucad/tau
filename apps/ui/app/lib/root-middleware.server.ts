import type { MiddlewareFunction } from 'react-router';
import { documentHeaders } from '@taucad/runtime/cross-origin-isolation';
import { reportingEndpoints } from '#lib/browser-reports.server.js';
import { reportOnlyContentSecurityPolicy } from '#lib/content-security-policy.server.js';
import { throwRedirectIfSubdomain } from '#lib/react-router.lib.js';
import { beginServerTiming } from '#lib/server-timing.server.js';

/**
 * The headers that are right on every server response, not only documents (React Router 8 migration C1): cross-origin
 * isolation, the report-only CSP and its reporting endpoint. A `.data` or resource response gets them too. The skew
 * cookie, `Cache-Control`, `Document-Policy` and the 404 mark stay in `handleRequest`, because they are only right on
 * a document. A response that already names one keeps its own.
 */
export const everyResponseHeaders: Readonly<Record<string, string>> = Object.freeze({
  ...documentHeaders,
  'Content-Security-Policy-Report-Only': reportOnlyContentSecurityPolicy,
  // SB6: CSP violations (`report-to default`) and Chromium crash reports go to the same-origin receiver.
  'Reporting-Endpoints': reportingEndpoints,
});

const applyEveryResponseHeaders = (headers: Headers): void => {
  for (const [name, value] of Object.entries(everyResponseHeaders)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
};

/**
 * The root server middleware: the `www.` redirect, the request's Server-Timing record and {@link everyResponseHeaders}
 * on whatever answers it, a thrown redirect included. An error thrown here needs no catch: React Router routes it to
 * the error boundary and to `entry.server`'s `handleError`.
 *
 * @param args - The middleware arguments.
 * @param args.url - The request's URL with React Router's `.data` details removed, so a redirect names the page.
 * @param args.context - The request's router context.
 * @param next - The rest of the pipeline.
 * @returns The response, with the shared headers.
 */
export const rootMiddleware: MiddlewareFunction<Response> = async ({ url, context }, next) => {
  try {
    throwRedirectIfSubdomain(url, 'www');
    beginServerTiming(context);
    const response = await next();
    applyEveryResponseHeaders(response.headers);
    return response;
  } catch (error) {
    if (error instanceof Response) {
      applyEveryResponseHeaders(error.headers);
    }
    throw error;
  }
};
