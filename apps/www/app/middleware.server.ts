import type { MiddlewareFunction } from 'react-router';

/**
 * The headers that are right on every response of the marketing site, documents and `.data` alike (React Router 8
 * migration C1). The document's CSP, which carries its nonce, its robots tag and its cache policy stay in
 * `entry.server.tsx`. A response that already names one keeps its own.
 */
export const everyResponseHeaders: Readonly<Record<string, string>> = Object.freeze({
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});

const applyEveryResponseHeaders = (headers: Headers): void => {
  for (const [name, value] of Object.entries(everyResponseHeaders)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
};

/**
 * The root server middleware: {@link everyResponseHeaders} on whatever answers the request, a thrown redirect included.
 * An error thrown here needs no catch: React Router routes it to the error boundary.
 *
 * @param _args - The middleware arguments.
 * @param next - The rest of the pipeline.
 * @returns The response, with the shared headers.
 */
export const rootMiddleware: MiddlewareFunction<Response> = async (_args, next) => {
  try {
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
