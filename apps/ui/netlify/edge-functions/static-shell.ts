/**
 * Serves the project static shell and expires the skew protection cookie on it (progressive loading PL3, ruling OD7).
 *
 * The shell is served here, as a rewrite to its prerendered file, and not by a `netlify.toml` rule. The React Router
 * function is registered with `preferStatic` (`@netlify/vite-plugin-react-router`), so Netlify answers a URL from its
 * redirect rules before the function, and a rule's `:project` matches any segment, dots included: a 200 rewrite of
 * `/w/:workspace/:project` also took `/w/home/bracket-v2.data`, the project's data request, and answered it with the
 * shell's HTML. A route's URLPattern can hold a segment to the dotless grammar; a redirect rule cannot. So this
 * function's paths are the only rule that names the shell's URLs: `.data`, `/preview` and every other `/w/…` shape reach
 * the function, and nothing excludes these URLs from it, so when the rewrite cannot be served (the function fails, or
 * the file answers with neither a 200 nor a 304) the function renders the same document, as it did before the shell.
 *
 * The cookie: the shell is a static file, so its `Set-Cookie` came from the `/w/*` header rule of `netlify.toml`.
 * Netlify's edge cache keeps that header off the object it stores: only the response that fills the cache carried it,
 * and every hit after it (`cache-status: "Netlify Edge"; hit`) arrived without it (taucad.dev, 2026-11-16), so most
 * shell opens left an older deploy's `tau_skew` pinning the shell's assets. An edge function runs on every request
 * before the cache answers and its own response is not cached (no `cache: "manual"`), so the cookie is set here per
 * response, while `context.next()` still serves the file from the CDN cache with its static headers (COOP, COEP, CORP,
 * the report-only CSP).
 *
 * The paths are generated from the route-class registry (`staticShellEdgePaths` in `app/lib/route-classes.ts`, held
 * equal by `route-classes.test.ts`). On the `www` alias the request is passed on, so the generated redirect to the apex
 * answers it. This file imports nothing, like the other edge functions, so the Deno bundle needs no app module.
 */

/** Netlify's `context.next`: with a request of the same site, it continues the chain with that URL (a rewrite). */
type EdgeContext = { next: (request?: Request) => Promise<Response> };

/** The project shell's prerendered file: `shellDocumentFile` of the project class, held equal by its test. */
export const projectShellDocument = '/w/__shell/__shell/index.html';

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

/**
 * The project shell for a project URL, rewritten from this site's own static file with the request's method and
 * headers, so a conditional request still revalidates. A rewrite stays on the host Netlify received.
 *
 * @param request - The project document request.
 * @param context - Netlify's edge context.
 * @returns The shell with the skew cookie's expiry, or the function's document when the shell cannot be served.
 */
export default async function staticShell(request: Request, context: EdgeContext): Promise<Response> {
  if (new URL(request.url).hostname.split('.')[0] === 'www') {
    return context.next(request);
  }
  const shell = await context.next(new Request(new URL(projectShellDocument, request.url), request));
  if (shell.status !== 200 && shell.status !== 304) {
    await shell.body?.cancel();
    return context.next(request);
  }
  return withShellSkewCookieExpiry(shell);
}

export const config = {
  path: [String.raw`/w/:workspace([^\/.]+)/:project([^\/.]+)`],
  // A failure must not take the page down: without this function, the React Router function renders the document.
  onError: 'bypass',
};
