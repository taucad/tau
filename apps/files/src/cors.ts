/**
 * CORS for the files host: echo an exact allowed origin, never credentials.
 *
 * Downloads are simple requests (`GET`, no custom headers, `credentials:
 * 'omit'`), so a browser normally sends no preflight; `OPTIONS` is answered
 * for a script that sends `Range` or `If-None-Match`.
 */

/** Headers a browser script may read from a files response, beyond the safelisted ones. */
export const exposedHeaders = 'ETag, Content-Range, Accept-Ranges, X-Tau-Files-Error';

/** How long a browser may cache a preflight. Chromium caps it at two hours. Seconds. */
const preflightMaxAge = 7200;

/**
 * Read the `FILES_ALLOWED_ORIGINS` binding: a JSON binding arrives parsed, a
 * plain-text one as JSON text. Anything else allows no origin.
 *
 * @param binding - The binding's value.
 * @returns The exact origins, no wildcards.
 */
export const allowedOrigins = (binding: unknown): ReadonlySet<string> => {
  let value = binding;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return new Set();
    }
  }
  return new Set(
    Array.isArray(value)
      ? value.filter((origin): origin is string => typeof origin === 'string' && origin !== '*')
      : [],
  );
};

/**
 * Set the CORS headers every files response carries.
 *
 * @param headers - The response headers to extend.
 * @param origin - The request's `Origin`, if any.
 * @param allowed - The exact allowed origins.
 */
export const applyCors = (headers: Headers, origin: string | undefined, allowed: ReadonlySet<string>): void => {
  headers.append('Vary', 'Origin');
  if (origin !== undefined && allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', exposedHeaders);
  }
};

/**
 * Answer a preflight: `204`, the two methods and the two request headers a download may use.
 *
 * @param origin - The request's `Origin`, if any.
 * @param allowed - The exact allowed origins.
 * @returns The preflight's status and headers; without an allowed origin they carry no grant.
 */
export const preflight = (
  origin: string | undefined,
  allowed: ReadonlySet<string>,
): Readonly<{ status: 204; headers: Headers }> => {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Headers': 'Range, If-None-Match',
    'Access-Control-Max-Age': String(preflightMaxAge),
    'Cache-Control': 'no-store',
  });
  applyCors(headers, origin, allowed);
  return { status: 204, headers };
};
