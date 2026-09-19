import { PassThrough } from 'node:stream';

import { createReadableStreamFromReadable } from '@react-router/node';
import { applyHandleRequestHeaders } from '@taucad/runtime/react-router';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { ServerRouter } from 'react-router';
import type { AppLoadContext, EntryContext } from 'react-router';
import { isCanonicalProductionUrl } from '#lib/canonical-url.js';

export const streamTimeout = 5000;

// React Router v7 mandates this exact 5-parameter signature; we intentionally
// exceed the max-params lint rule to match the framework contract.
// oxlint-disable-next-line max-params -- match React Router v7 contract
export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
): Promise<Response> | Response {
  applyHandleRequestHeaders(responseHeaders);
  /* OQ-P11: `Document-Policy: js-profiling` lets a developer take a real sampling profile of this
   * document from `Profiler`. It is off the production origin, where it would offer every visitor's
   * browser a profiler it has no use for. */
  if (!isCanonicalProductionUrl(request.url)) {
    responseHeaders.set('Document-Policy', 'js-profiling');
  }

  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise<Response>((resolve: (value: Response) => void, reject: (reason: unknown) => void) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');
    const isBotAgent = userAgent ? isbot(userAgent) : false;
    const readyOption: keyof RenderToPipeableStreamOptions =
      isBotAgent || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      abort();
    }, streamTimeout + 1000);

    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} />, {
      [readyOption]() {
        shellRendered = true;
        const body = new PassThrough({
          final(callback) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
            callback();
          },
        });
        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set('Content-Type', 'text/html');

        pipe(body);

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
        if (shellRendered) {
          console.error(error);
        }
      },
    });
  });
}
