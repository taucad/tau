import { PassThrough } from 'node:stream';

import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { ServerRouter } from 'react-router';
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from 'react-router';
import { cdnCacheControlResponseHeader } from '@taucad/ui-core/constants/cache.constants';
import { isCanonicalProductionUrl } from '#lib/canonical-url.js';
import { skewProtectionCookie, skewProtectionToken } from '#lib/skew-protection.server.js';
import { createModulePreloadCap, criticalModuleHrefs, isNotFoundRender } from '@taucad/ui-core/lib/module-preload-cap';
import {
  claimSsrErrors,
  leafRouteId,
  queueSsrError,
  reportSsrError,
  routeErrorInstrumentation,
} from '#lib/sentry.server.js';
import { startDocumentTiming } from '#lib/server-timing.server.js';
import { createAppRuntime } from '#runtime/app-runtime.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';

export const streamTimeout = 5000;

/** RR7: the route a failed loader, action or middleware belongs to, for the SSR error report's route tags. */
export const instrumentations = [routeErrorInstrumentation];

/**
 * Server errors React Router saw in a loader, action or render (SB10). A request the client aborted is skipped, as
 * React Router's own guidance does; every other error is still logged and goes to the SSR reporter, which waits for
 * the document render to name its route ({@link claimSsrErrors}).
 *
 * @param error - The thrown value.
 * @param args - The request it belongs to.
 */
export const handleError: HandleErrorFunction = (error, { request }) => {
  if (request.signal.aborted) {
    return;
  }
  console.error(error);
  queueSsrError(error, request);
};

// React Router v7 mandates this exact 5-parameter signature; we intentionally
// exceed the max-params lint rule to match the framework contract.
// oxlint-disable-next-line max-params -- match React Router v7 contract
export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
): Promise<Response> | Response {
  /* LB0a: the cold-instance mark, the loader's catalog entry and the render time to the headers go out as
   * `Server-Timing`. A streamed document's headers leave at shell ready, so all-ready and bytes are not in them. */
  const timing = startDocumentTiming(loadContext);
  const routeId = leafRouteId(routerContext);
  // Errors `handleError` took for this document go out with its route and status (SB10).
  claimSsrErrors(request, routeId, responseStatusCode);
  /* Cross-origin isolation, the report-only CSP and `Reporting-Endpoints` are on every response, so the root
   * middleware sets them (`#lib/root-middleware.server`); what follows is right on a document only. */
  /* TAU-UI-6: a document names its build's hashed chunks, and a deploy stops serving them, so no
   * cache may answer a load or refresh with a stored document without asking the server. It is
   * also rendered from the visitor's cookies, so no shared cache may keep it (`private`). The apex
   * `/` is chosen by a presentation cookie, so no cache keeps it at all (`no-store`), as the `/`
   * rule in `netlify.toml` says; that file's header blocks do not reach function responses, and the
   * marketing edge function only covers Netlify. Routes that choose their own policy (a loader's
   * `Cache-Control`, such as the cloud link viewer's `private, no-store`) keep it. */
  if (!responseHeaders.has('Cache-Control')) {
    responseHeaders.set(
      'Cache-Control',
      new URL(request.url).pathname === '/' ? 'private, no-store' : 'private, no-cache',
    );
  }
  /* TAU-UI-S: pin this page's later chunk, `.data` and manifest requests to the deploy that rendered it
   * (production only). Never on a document the CDN may store (one carrying `Netlify-CDN-Cache-Control`): a stored
   * `Set-Cookie` would be replayed to every visitor, or keep the response out of the cache. */
  const skewCookie = responseHeaders.has(cdnCacheControlResponseHeader)
    ? undefined
    : skewProtectionCookie(
        skewProtectionToken(
          (globalThis as { Netlify?: Parameters<typeof skewProtectionToken>[0] }).Netlify,
          process.env,
        ),
      );
  if (skewCookie !== undefined) {
    responseHeaders.append('Set-Cookie', skewCookie);
  }
  /* OQ-P11: `Document-Policy: js-profiling` lets a developer take a real sampling profile of this
   * document from `Profiler`. It is off the production origin, where it would offer every visitor's
   * browser a profiler it has no use for. */
  if (!isCanonicalProductionUrl(request.url)) {
    responseHeaders.set('Document-Policy', 'js-profiling');
  }

  /* The catch-all page has no loader, because the desktop and `tau serve` SPA builds share it, so
   * an unknown path is marked here rather than by a thrown response. */
  if (responseStatusCode === 200 && isNotFoundRender(routerContext)) {
    responseStatusCode = 404;
  }

  if (request.method.toUpperCase() === 'HEAD') {
    responseHeaders.append('Server-Timing', timing.withoutRender());
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise<Response>((resolve: (value: Response) => void, reject: (reason: unknown) => void) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');
    /*
     * A prerender is not a bot. React Router 8 prerenders over HTTP through a Vite preview server, whose `fetch` sends
     * `User-Agent: node`, which `isbot` matches; the shells must stream as the function's document does for a browser
     * (shell invariant 1). React Router sets `IS_RR_BUILD_REQUEST` for the whole prerender pass.
     */
    const isBuildRequest = process.env['IS_RR_BUILD_REQUEST'] === 'yes';
    const isBotAgent = userAgent && !isBuildRequest ? isbot(userAgent) : false;
    const readyOption: keyof RenderToPipeableStreamOptions =
      isBotAgent || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      abort();
    }, streamTimeout + 1000);

    /* D5: one runtime per request, never started, so every reader renders the snapshot the client hydrates from. */
    const app = (
      <AppRuntimeProvider runtime={createAppRuntime()}>
        <ServerRouter context={routerContext} url={request.url} />
      </AppRuntimeProvider>
    );
    const { pipe, abort } = renderToPipeableStream(app, {
      [readyOption]() {
        shellRendered = true;
        const body = createModulePreloadCap(criticalModuleHrefs(routerContext));
        const rendered = new PassThrough({
          final(callback) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
            callback();
          },
        });
        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set('Content-Type', 'text/html');
        responseHeaders.append('Server-Timing', timing.atReady(readyOption));

        rendered.pipe(body);
        pipe(rendered);

        resolve(
          new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }),
        );
      },
      onShellError(error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      onError(error: unknown) {
        responseStatusCode = 500;
        // Before the shell, the error reaches `onShellError` and React Router's `handleError` instead.
        if (shellRendered) {
          console.error(error);
          reportSsrError(error, { request, routeId, status: responseStatusCode, channel: 'stream' });
        }
      },
    });
  });
}
