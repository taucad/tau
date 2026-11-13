/**
 * The server entry of the SPA builds (desktop and `tau serve`), which prerender one `index.html` at build time
 * (app state orchestration charter D5).
 *
 * Those builds keep `ssr: false` and have no `entry.server` of their own, so React Router's default rendered the
 * document without an app runtime, and `SessionsProvider` had none to read. This is React Router's default node
 * entry with one change: like `entry.server.tsx`, it renders an unstarted runtime, created per render and never
 * started, so the prerendered document is the initial snapshot the client hydrates from. It waits for the whole
 * document through `allReady` rather than racing a timer (I15).
 */
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';
import type { AppLoadContext, EntryContext } from 'react-router';
import { createAppRuntime } from '#runtime/app-runtime.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';

// React Router v7 mandates this exact 5-parameter signature.
// oxlint-disable-next-line max-params -- match React Router v7 contract
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
): Promise<Response> {
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  let status = responseStatusCode;
  let shellRendered = false;
  const stream = await renderToReadableStream(
    <AppRuntimeProvider runtime={createAppRuntime()}>
      <ServerRouter context={routerContext} url={request.url} />
    </AppRuntimeProvider>,
    {
      signal: request.signal,
      onError(error: unknown) {
        status = 500;
        // An error before the shell rejects this call and React Router logs it.
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;

  /* Bots and the SPA prerender wait for the whole document, as React Router's default entry does. */
  const userAgent = request.headers.get('user-agent');
  if (routerContext.isSpaMode || (userAgent !== null && isbot(userAgent))) {
    await stream.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(stream, { headers: responseHeaders, status });
}
