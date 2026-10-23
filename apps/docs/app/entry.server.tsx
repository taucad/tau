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
  const stream = await renderToReadableStream(<ServerRouter context={context} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      status = 500;
      console.error(error);
    },
  });
  // The docs only render at build time. Waiting for every Suspense boundary makes each prerendered page complete,
  // byte-identical HTML for the same sources, so a staging deploy can be skipped when its output is unchanged.
  await stream.allReady;
  headers.set('Content-Type', 'text/html');
  return new Response(stream, { headers, status });
}
