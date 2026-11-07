/* Helpers for the same-origin ingest routes (`/api/monitoring`, `/api/reports`). */

/** The address a request came from: Netlify's client connection IP, else the first forwarded hop. */
export const clientOf = (request: Request): string =>
  request.headers.get('x-nf-client-connection-ip') ??
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown';

/**
 * Read a request body up to `limit` bytes, without buffering more than that.
 *
 * @param request - The request whose body to read.
 * @param limit - The largest body accepted, in bytes.
 * @returns The body as text, or `undefined` once it is larger than `limit`.
 */
export const readCapped = async (request: Request, limit: number): Promise<string | undefined> => {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    return undefined;
  }
  if (request.body === null) {
    return '';
  }
  const reader = request.body.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  // oxlint-disable no-await-in-loop -- A stream is read in order, one chunk at a time.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  // oxlint-enable no-await-in-loop
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};
