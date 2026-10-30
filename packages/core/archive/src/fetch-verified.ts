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

// Only known platform codes may cross the diagnostic boundary; messages, addresses and URLs never do.
const transportCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE',
]);

/**
 * Read data properties without invoking getters on custom transport failures.
 * @param value - Untrusted thrown value.
 * @param key - Property to inspect.
 * @returns Its own data value, or undefined.
 */
const ownData = (value: unknown, key: string): unknown => {
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
};

/**
 * Bound traversal and output for cyclic causes, aggregate fan-out and hostile proxies.
 * @param error - Untrusted transport failure.
 * @param attempt - One-based attempt number.
 * @returns A fresh cause containing only recognized codes and attempt context.
 */
const transportCause = (error: unknown, attempt: number): Error => {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  const codes = new Set<string>();
  for (let index = 0; index < pending.length && index < 16; index += 1) {
    const value = pending[index];
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const code = ownData(value, 'code');
    if (typeof code === 'string' && transportCodes.has(code)) {
      codes.add(code);
    }
    if (pending.length < 16) {
      pending.push(ownData(value, 'cause'));
    }
    const errors = ownData(value, 'errors');
    // Array.isArray can throw for a revoked proxy; inspection must never replace the transport failure.
    try {
      if (Array.isArray(errors)) {
        const length = ownData(errors, 'length');
        const count = typeof length === 'number' ? Math.min(length, 16) : 0;
        for (let child = 0; child < count && pending.length < 16; child += 1) {
          pending.push(ownData(errors, String(child)));
        }
      }
    } catch {
      // A hostile aggregate contributes no diagnostics.
    }
  }
  return new Error(`Transport attempt ${attempt}/${attempts}; codes: ${[...codes].join(', ') || 'unknown'}`);
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const downloadFailure = (
  input: FetchVerifiedInput,
  detail: string | Error,
  reason: 'http-status' | 'transport' | 'byte-length' | 'redirect',
): ArchiveError =>
  new ArchiveError(
    'DOWNLOAD_FAILED',
    `Download of ${input.url} failed (${typeof detail === 'string' ? detail : detail.message}).`,
    {
      reason,
      path: input.url,
      detail: typeof detail === 'string' ? detail : detail.message,
      ...(typeof detail === 'string' ? {} : { cause: detail }),
    },
  );

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
      const cause = transportCause(error, attempt + 1);
      failure =
        error instanceof ArchiveError && error.code === 'DOWNLOAD_FAILED'
          ? error
          : downloadFailure(
              input,
              error instanceof ArchiveError
                ? error.message
                : watch.signal.aborted
                  ? `no bytes received for ${stallTimeoutMilliseconds} ms`
                  : cause,
              'transport',
            );
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
