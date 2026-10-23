/**
 * Staging router: the only production deploy of a staging site. Serves every request to the site's custom domain
 * from the `staging` alias deploy (`action.yml` writes the alias origin and public host over the placeholders).
 *
 * A `_redirects` proxy to a deploy on the same team skips that deploy's edge functions, which the UI needs (its
 * marketing edge function serves `/` and the apps/www pages). Fetching the alias as any client would runs them. The
 * alias reads the visitor's domain from `X-Tau-Public-Host` (`apps/ui/netlify/edge-functions/marketing.ts`).
 */
const target = '__TAU_ROUTER_TARGET__';
const publicHost = '__TAU_ROUTER_PUBLIC_HOST__';
const router = { version: 2, target, host: publicHost };

export default async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/__tau-staging-router') {
    return Response.json(router, { headers: { 'cache-control': 'no-store' } });
  }

  const upstream = new URL(`${url.pathname}${url.search}`, target);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('accept-encoding');
  headers.set('x-tau-public-host', publicHost);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
    // @ts-expect-error -- Deno streams a request body without the `duplex` option; standard runtimes require it.
    duplex: 'half',
  });

  const location = response.headers.get('location');
  if (location === null) {
    return response;
  }
  // Keep a redirect to the alias (a trailing-slash or app redirect) on the visitor's domain.
  const resolved = new URL(location, upstream);
  if (resolved.origin !== new URL(target).origin) {
    return response;
  }
  const rewritten = new Headers(response.headers);
  rewritten.set('location', `https://${publicHost}${resolved.pathname}${resolved.search}${resolved.hash}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: rewritten });
}

export const config = { path: '/*' };
