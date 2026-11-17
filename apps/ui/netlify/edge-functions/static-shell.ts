/**
 * Expires the skew protection cookie on every static shell response (progressive loading PL3, ruling OD7).
 *
 * The shell is a static file, so its `Set-Cookie` came from the `/w/*` header rule of `netlify.toml`. Netlify's edge
 * cache keeps that header off the object it stores: only the response that fills the cache carried it, and every hit
 * after it (`cache-status: "Netlify Edge"; hit`) arrived without it (taucad.dev, 2026-11-16), so most shell opens left an
 * older deploy's `tau_skew` pinning the shell's assets. Netlify documents `Set-Cookie` as a custom header it may
 * override. An edge function runs on every request before the cache answers and its own response is not cached
 * (no `cache: "manual"`), so the cookie is set here per response, while `context.next()` still serves the file from the
 * CDN cache with its static headers (COOP, COEP, CORP, the report-only CSP).
 *
 * The paths are exactly the URLs the React Router function excludes (`netlifyFunctionExcludedPaths` in
 * `app/lib/route-classes.ts`, held equal by `route-classes.test.ts`): Netlify compiles both to the same expression with
 * an optional trailing slash, so `.data`, `/preview` and every other `/w/…` shape stay on the function and keep their
 * pin. This file imports nothing, like the other edge functions, so the Deno bundle needs no app module.
 */

type EdgeContext = { next: () => Promise<Response> };

/** The skew protection cookie's expiry: `shellSkewCookie(skewProtectionCookieName)`, the `/w/*` header rule's value. */
export const shellSkewCookieExpiry = 'tau_skew=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax';

/**
 * The response with the skew cookie's expiry, sent once: a response the header rule already gave it keeps one copy.
 * A `304` gets it too, since a browser revalidating the shell applies the cookies of the `304`.
 *
 * @param response - The static shell's response.
 * @returns A response with the same status, body and headers, plus the expiry.
 */
export function withShellSkewCookieExpiry(response: Response): Response {
  const headers = new Headers(response.headers);
  if (headers.getSetCookie().includes(shellSkewCookieExpiry)) {
    return response;
  }
  headers.append('set-cookie', shellSkewCookieExpiry);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default async function staticShell(_request: Request, context: EdgeContext): Promise<Response> {
  return withShellSkewCookieExpiry(await context.next());
}

export const config = {
  path: [String.raw`/w/:workspace([^\/.]+)/:project([^\/.]+)`],
  // A failure must not take the shell down: without the function, the file is served as before.
  onError: 'bypass',
};
