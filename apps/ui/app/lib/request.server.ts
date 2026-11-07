/* Helpers for the same-origin ingest routes (`/api/monitoring`, `/api/reports`). */

/**
 * The address a request came from: Netlify's client connection IP, which the edge sets and a caller cannot. Without
 * it every caller shares one `unknown` bucket: a caller-set `X-Forwarded-For` would let one client rotate past its
 * limit and evict others' windows.
 *
 * @param request - The request.
 * @returns The client address, or `unknown`.
 */
export const clientOf = (request: Request): string => request.headers.get('x-nf-client-connection-ip') ?? 'unknown';

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

/** Client addresses tracked at once, at most; the oldest window is forgotten first. */
const trackedClientLimit = 10_000;

/** A fixed-window counter per client address, bounded in the addresses it remembers. */
export type ClientRateLimiter = (client: string, now: number) => boolean;

/**
 * Create a per-client fixed-window limiter, per server instance: a best effort bound, not a global quota.
 *
 * @param limit - Requests per window and the window's length.
 * @returns `true` while a client is within its window's allowance.
 */
export const createClientRateLimiter = (
  limit: Readonly<{ envelopes: number; windowMilliseconds: number }>,
): ClientRateLimiter => {
  const windows = new Map<string, { start: number; count: number }>();
  return (client, now) => {
    const current = windows.get(client);
    if (current === undefined || now - current.start >= limit.windowMilliseconds) {
      windows.delete(client);
      if (windows.size >= trackedClientLimit) {
        const oldest = windows.keys().next();
        if (oldest.done !== true) {
          windows.delete(oldest.value);
        }
      }
      windows.set(client, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit.envelopes;
  };
};
