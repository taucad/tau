import { PassThrough } from 'node:stream';
import type { EntryContext } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import * as isbotModule from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';

const abortDelay = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
): Promise<unknown> {
  const prohibitOutOfOrderStreaming = isBotRequest(request.headers.get('user-agent')) || reactRouterContext.isSpaMode;

  return prohibitOutOfOrderStreaming
    ? handleBotRequest(request, responseStatusCode, responseHeaders, reactRouterContext)
    : handleBrowserRequest(request, responseStatusCode, responseHeaders, reactRouterContext);
}

// We have some Remix apps in the wild already running with isbot@3 so we need
// to maintain backwards compatibility even though we want new apps to use
// isbot@4.  That way, we can ship this as a minor Semver update to @remix-run/dev.
// eslint-disable-next-line @typescript-eslint/no-restricted-types -- the header can be null
function isBotRequest(userAgent: string | null) {
  if (!userAgent) {
    return false;
  }

  // Isbot >= 3.8.0, >4
  if ('isbot' in isbotModule && typeof isbotModule.isbot === 'function') {
    return isbotModule.isbot(userAgent);
  }

  return false;
}

async function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
      onAllReady() {
        shellRendered = true;
        const body = new PassThrough();
        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set('Content-Type', 'text/html');

        resolve(
          new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }),
        );

        pipe(body);
      },
      onShellError(error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell.  Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    });

    setTimeout(abort, abortDelay);
  });
}

async function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
      onShellReady() {
        shellRendered = true;
        const body = new PassThrough();
        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set('Content-Type', 'text/html');

        resolve(
          new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }),
        );

        pipe(body);
      },
      onShellError(error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell.  Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    });

    setTimeout(abort, abortDelay);
  });
}
