import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';
import type { EntryContext } from 'react-router';

// oxlint-disable-next-line eslint/max-params -- React Router defines this server entry signature.
export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
): Promise<Response> {
  const rootData: unknown = context.staticHandlerContext.loaderData['root'];
  const nonce =
    rootData && typeof rootData === 'object' && 'nonce' in rootData && typeof rootData.nonce === 'string'
      ? rootData.nonce
      : undefined;
  const stream = await renderToReadableStream(<ServerRouter context={context} url={request.url} nonce={nonce} />, {
    nonce,
    signal: request.signal,
    onError(error: unknown) {
      status = 500;
      console.error(error);
    },
  });
  // Marketing documents are small: complete head and status before sending to crawlers or visitors.
  await stream.allReady;
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.taucad.dev https://api.tau.new${rootData && typeof rootData === 'object' && 'installerCatalog' in rootData && rootData.installerCatalog === true ? ' https://downloads.tau.new https://downloads.taucad.dev' : ''}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  if (!(rootData && typeof rootData === 'object' && 'launch' in rootData && rootData.launch === true)) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  headers.set(
    'Netlify-CDN-Cache-Control',
    status === 200 ? 'public, durable, s-maxage=600, stale-while-revalidate=86400' : 'no-store',
  );
  return new Response(stream, { status, headers });
}
