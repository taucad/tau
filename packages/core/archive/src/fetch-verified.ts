import { ArchiveError } from '#archive-error.js';
import { readBoundedStream } from '#bounded-stream.js';
import { integrityMatches } from '#integrity.js';

/**
 * Redirect policy of {@link fetchVerified}. When given, redirects are followed by hand: only `https:` targets the
 * predicate admits, at most `maximum` hops. When absent, the platform follows redirects (a browser cannot read them).
 * @public
 */
export type FetchRedirectPolicy = {
  readonly maximum: number;
  /** Whether a redirect target may be followed. */
  readonly allow: (url: URL) => boolean;
};

/**
 * Input of {@link fetchVerified}.
 * @public
 */
export type FetchVerifiedInput = {
  readonly url: string;
  /** SRI string the bytes must match; see `integrityMatches`. */
  readonly integrity: string;
  /** Declared size: a longer or shorter body fails the attempt before hashing. */
  readonly byteLength?: number;
  /** Upper bound on the body when `byteLength` is not declared. */
  readonly maximumBytes?: number;
  readonly redirect?: FetchRedirectPolicy;
  /** Transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly signal: AbortSignal;
};

const stallTimeoutMilliseconds = 60_000;
const attempts = 3;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const downloadFailure = (
  input: FetchVerifiedInput,
  detail: string,
  reason: 'http-status' | 'transport' | 'byte-length' | 'redirect',
): ArchiveError =>
  new ArchiveError('DOWNLOAD_FAILED', `Download of ${input.url} failed (${detail}).`, {
    reason,
    path: input.url,
    detail,
  });

/**
 * An abort signal that fires once `milliseconds` pass without a call to `progress`, so a slow body that keeps
 * arriving is never cut off while a silent one is.
 * @param milliseconds - Longest silence an attempt tolerates.
 * @returns The signal, `progress` to restart the silence, and `stop` to clear the timer.
 */
const stallWatch = (
  milliseconds: number,
): { readonly signal: AbortSignal; readonly progress: () => void; readonly stop: () => void } => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    clearTimeout(timer);
  };
  const progress = (): void => {
    stop();
    timer = setTimeout(() => {
      controller.abort(new DOMException(`no bytes received for ${milliseconds} ms`, 'TimeoutError'));
    }, milliseconds);
  };
  progress();
  return { signal: controller.signal, progress, stop };
};

// One request, following redirects by hand when a policy is given.
const request = async (input: FetchVerifiedInput, signal: AbortSignal): Promise<Response> => {
  const transport = input.fetch ?? fetch;
  if (input.redirect === undefined) {
    return transport(input.url, { signal, credentials: 'omit' });
  }
  let url = new URL(input.url);
  for (let hop = 0; ; hop += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each hop depends on the previous Location
    const response = await transport(url, { signal, credentials: 'omit', redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || location === null) {
      return response;
    }
    const next = new URL(location, url);
    if (hop >= input.redirect.maximum || next.protocol !== 'https:' || !input.redirect.allow(next)) {
      // oxlint-disable-next-line no-await-in-loop -- release the refused response before failing
      await response.body?.cancel();
      throw downloadFailure(input, `redirect to ${next.origin} refused`, 'redirect');
    }
    // oxlint-disable-next-line no-await-in-loop -- release the redirect response before the next hop
    await response.body?.cancel();
    url = next;
  }
};

/**
 * Download bytes and verify them against their SRI pin before returning them. Transport errors, 429 and 5xx are
 * retried (three attempts, 100 ms then 200 ms apart); other statuses are not. An attempt fails once 60 s pass with
 * neither a response nor a body chunk, so a slow body that keeps arriving is never cut off. No credentials are sent.
 * Nothing is returned unless the whole body matched `integrity`.
 * @param input - URL, pin, size policy, redirect policy, transport and signal.
 * @returns The verified bytes.
 * @throws {ArchiveError} `DOWNLOAD_FAILED` when no attempt returned an acceptable body; `INTEGRITY_MISMATCH` when it
 * did not match `integrity`. An abort rejects with the signal's reason.
 * @public
 */
export const fetchVerified = async (input: FetchVerifiedInput): Promise<Uint8Array<ArrayBuffer>> => {
  const maximumBytes = input.byteLength ?? input.maximumBytes ?? Number.POSITIVE_INFINITY;
  let failure: ArchiveError = downloadFailure(input, 'no response', 'transport');
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      // ponytail: backoff ignores abort for at most 200 ms; the signal is checked right after.
      // oxlint-disable-next-line no-await-in-loop -- bounded retry backoff avoids hammering the origin
      await delay(100 * 2 ** (attempt - 1));
      input.signal.throwIfAborted();
    }
    const watch = stallWatch(stallTimeoutMilliseconds);
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded sequential retries
      const response = await request(input, AbortSignal.any([input.signal, watch.signal]));
      if (response.ok && response.body !== null) {
        const progressing = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
          transform(chunk, controller) {
            watch.progress();
            controller.enqueue(chunk);
          },
        });
        // oxlint-disable-next-line no-await-in-loop -- consume the successful response
        const body = await readBoundedStream(response.body.pipeThrough(progressing), maximumBytes);
        if (input.byteLength !== undefined && body.byteLength !== input.byteLength) {
          throw downloadFailure(input, `${body.byteLength} of ${input.byteLength} bytes`, 'byte-length');
        }
        bytes = body;
        break;
      }
      failure = downloadFailure(input, `HTTP ${response.status}`, 'http-status');
      if (response.status !== 429 && response.status < 500) {
        break;
      }
    } catch (error) {
      input.signal.throwIfAborted();
      if (error instanceof ArchiveError && error.reason === 'redirect') {
        throw error;
      }
      failure =
        error instanceof ArchiveError && error.code === 'DOWNLOAD_FAILED'
          ? error
          : downloadFailure(input, errorMessage(error), 'transport');
    } finally {
      watch.stop();
    }
  }
  if (bytes === undefined) {
    throw failure;
  }
  if (!(await integrityMatches(bytes, input.integrity))) {
    throw new ArchiveError('INTEGRITY_MISMATCH', `${input.url} does not match its pinned integrity.`, {
      reason: 'digest',
      path: input.url,
    });
  }
  return bytes;
};
