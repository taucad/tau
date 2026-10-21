/**
 * The browser leg's git-LFS client (S49, A24).
 *
 * `isomorphic-git@1.38.5` has no LFS, no `.gitattributes` handling and no
 * filter hook, so the browser's client is Tau's. It is small because the format
 * already is: {@link cleanLargeObjects} decides what becomes a pointer and
 * `lfs.ts` writes the pointer bytes; this module is only the *batch API* — "the
 * remote tells me where to put these objects, and I put them there".
 *
 * Two rules the shape is built from:
 *
 * - **Objects before the ref that names them.** A pointer landing on a remote
 *   whose store has no object behind it is a file nobody can ever read, so the
 *   upload is sequenced before the push (A32, A39). It is idempotent: the batch
 *   response omits the `upload` action for an object the server already has,
 *   which is what makes "one upload per object" true (V13) without Tau keeping
 *   a ledger of what it uploaded.
 * - **The batch call carries the Tau credential; the transfer carries the
 *   server's.** git-lfs over HTTPS authenticates the batch endpoint with the
 *   same credential as the git request (`lfs-authenticate` is the SSH path and
 *   Tau has no SSH transport), and the batch response then issues per-object
 *   `href` and `header` for the transfer — a presigned R2 URL that must be
 *   fetched with *those* headers and no others. Sending a bearer token to a
 *   presigned URL leaks it to the object store for nothing.
 */

/* eslint-disable @typescript-eslint/naming-convention -- the git-lfs batch body (`hash_algo`) and HTTP header names (`Accept`) are spelled by their own specifications, not by ours. */

/* oxlint-disable no-await-in-loop -- sequential object transfers and bounded retries keep one object resident. */

import { lfsPointerFor } from '#lfs.js';
import { remoteTransportError } from '#remotes.js';
import type { LfsPointer } from '#lfs.js';
import type { RevisionHttpClient, RevisionHttpResponse } from '#http-client.js';
import { z } from 'zod';

/**
 * What a remote refused to store, in the shape the Sync region renders.
 *
 * The server speaks in object ids, because that is all the LFS batch endpoint
 * knows; a caller that holds the tree maps them back to paths (D16, AC16).
 *
 * @public
 */
export type LfsQuotaRefusal = Readonly<{
  message: string;
  /** Object ids the remote refused, in the order it listed them. */
  oids: readonly string[];
  /** Project-relative paths, once a caller that holds the tree fills them in. */
  paths: readonly string[];
  /** How much more room the push needed, when the server said. */
  shortfallBytes?: number;
  /** How much room is left, when the server said. */
  remainingBytes?: number;
}>;

/** A remote refused a large object because the project is over its plan (D16, AC16). @public */
export class LfsQuotaError extends Error {
  public readonly refusal: LfsQuotaRefusal;

  /**
   * Create a quota refusal.
   *
   * @param refusal - What the server said, already parsed.
   */
  public constructor(refusal: LfsQuotaRefusal) {
    super(refusal.message);
    this.name = 'LfsQuotaError';
    this.refusal = refusal;
  }
}

/** Dependencies one project's LFS client needs. @public */
export type LfsClientOptions = Readonly<{
  /** The remote's git URL; the batch endpoint hangs off it. */
  url: string;
  /** The Tau client, so the batch call carries the session credential (I8). */
  http: RevisionHttpClient;
  /** Injected in tests; the transfers do not go through the Tau client. */
  fetch?: typeof globalThis.fetch;
  /** The remote's name, so a batch refusal is classified exactly as the git leg's (D53). */
  remote?: string;
  /** Optional remote-specific per-file upload ceiling. Omit to defer to the remote. */
  maximumUploadBytes?: number;
}>;

/** What one upload offers the remote. @public */
export type LfsUploadInput = Readonly<{
  /** Every object the pushed refs reference, whether or not its bytes are on this device. */
  pointers: readonly LfsPointer[];
  /** Cancel this operation, including capability refresh and verification. */
  signal?: AbortSignal;
  /**
   * Read one object's bytes. Called only for an object the remote asks for:
   * an object that came *from* the remote is never downloaded just to learn it
   * is already there.
   */
  read: (oid: string) => Promise<Uint8Array<ArrayBuffer>>;
}>;

/** A pointer to download, with operation-scoped cancellation. @public */
export type LfsDownloadInput = LfsPointer & Readonly<{ signal?: AbortSignal }>;

/** One project's LFS transport. @public */
export type LfsClient = Readonly<{
  /** Upload every object the remote does not already hold. Resolves to the oids sent. */
  upload: (input: LfsUploadInput) => Promise<readonly string[]>;
  /** Fetch one object's bytes by its pointer. */
  download: (pointer: LfsDownloadInput) => Promise<Uint8Array<ArrayBuffer>>;
}>;

const mediaType = 'application/vnd.git-lfs+json';

type BatchAction = Readonly<{ href: string; header?: Readonly<Record<string, string>>; expiresAt?: number }>;
type BatchObject = Readonly<{
  oid: string;
  size: number;
  actions?: Readonly<{ upload?: BatchAction; download?: BatchAction; verify?: BatchAction }>;
  error?: Readonly<{ code: number; message: string }>;
}>;
const batchActionSchema = z
  .object({
    href: z.url(),
    header: z.record(z.string(), z.string()).optional(),
    expires_in: z.number().nonnegative().optional(),
    expires_at: z.iso.datetime({ offset: true }).optional(),
  })
  .transform(({ expires_in: seconds, expires_at: date, ...action }) => ({
    ...action,
    expiresAt: Math.min(
      seconds === undefined ? Infinity : Date.now() + seconds * 1000,
      date === undefined ? Infinity : Date.parse(date),
    ),
  }));
const transferAttempts = 3;
const retryable = (status: number): boolean => status === 429 || status >= 500;
const expired = (action: BatchAction): boolean => (action.expiresAt ?? Infinity) <= Date.now() + 5000;

const backoff = async (attempt: number, signal?: AbortSignal): Promise<void> => {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(
        signal?.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError'),
      );
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      },
      200 * 2 ** attempt,
    );
    signal?.addEventListener('abort', abort, { once: true });
  });
};
const batchObjectSchema = z.object({
  oid: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.number().int().nonnegative(),
  actions: z
    .object({
      upload: batchActionSchema.optional(),
      download: batchActionSchema.optional(),
      verify: batchActionSchema.optional(),
    })
    .optional(),
  error: z.object({ code: z.number().int(), message: z.string() }).optional(),
});
const batchResponseSchema = z.object({ objects: z.array(batchObjectSchema) });

const encoder = new TextEncoder();

/* The Tau client speaks `isomorphic-git`'s body shape; JSON is one chunk. */
const oneChunk = (bytes: Uint8Array<ArrayBuffer>): AsyncIterableIterator<Uint8Array<ArrayBuffer>> => {
  let sent = false;
  const iterator: AsyncIterableIterator<Uint8Array<ArrayBuffer>> = {
    next: async (): Promise<IteratorResult<Uint8Array<ArrayBuffer>>> => {
      await Promise.resolve();
      if (sent) {
        return { done: true, value: undefined };
      }
      sent = true;
      return { done: false, value: bytes };
    },
    [Symbol.asyncIterator]: (): AsyncIterableIterator<Uint8Array<ArrayBuffer>> => iterator,
  };
  return iterator;
};

const readAll = async (body: RevisionHttpResponse['body']): Promise<string> => {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of body) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
};

/**
 * Read a 413 body as a quota refusal, however much of it the server filled in.
 *
 * @param body - The response body.
 * @returns The refusal the Sync region renders.
 */
const quotaRefusal = (body: string): LfsQuotaRefusal => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  const record = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Readonly<{
    message?: unknown;
    files?: unknown;
    shortfallBytes?: unknown;
    remainingBytes?: unknown;
  }>;
  /* The git-lfs refusal body, as the Tau API writes it: `message` is what a
   * stock `git lfs push` prints, `files` is the object list (W11a §9.4). */
  const files = Array.isArray(record.files) ? record.files : [];
  return Object.freeze({
    message: typeof record.message === 'string' ? record.message : 'This project is over its storage plan.',
    oids: Object.freeze(
      files
        .map((file: unknown) => (file as Readonly<{ oid?: unknown }>).oid)
        .filter((oid): oid is string => typeof oid === 'string'),
    ),
    paths: Object.freeze([]),
    ...(typeof record.shortfallBytes === 'number' ? { shortfallBytes: record.shortfallBytes } : {}),
    ...(typeof record.remainingBytes === 'number' ? { remainingBytes: record.remainingBytes } : {}),
  });
};

/**
 * The same refusal with its object ids resolved to project paths.
 *
 * @param refusal - What the server said.
 * @param paths - Path by object id, from the tree the push was offering.
 * @returns The refusal the Sync region can render.
 * @public
 */
export const withQuotaPaths = (refusal: LfsQuotaRefusal, paths: ReadonlyMap<string, string>): LfsQuotaRefusal =>
  Object.freeze({
    ...refusal,
    paths: Object.freeze(
      refusal.oids.map((oid) => paths.get(oid)).filter((path): path is string => path !== undefined),
    ),
  });

/**
 * Create one project's LFS client.
 *
 * @param options - The remote URL and the Tau HTTP client.
 * @returns The batch client.
 * @public
 *
 * @example <caption>Objects, then the ref that names them</caption>
 * ```typescript
 * import { createLfsClient } from '@taucad/revisions';
 * import type { RevisionHttpClient } from '@taucad/revisions';
 *
 * declare const client: RevisionHttpClient;
 * const lfs = createLfsClient({ url: 'https://api.tau.new/v1/git/p1.git', http: client });
 * const bytes = new Uint8Array(new ArrayBuffer(8));
 * await lfs.upload({ pointers: [{ oid: 'a'.repeat(64), size: 8 }], read: async () => bytes });
 * ```
 */
export const createLfsClient = (options: LfsClientOptions): LfsClient => {
  const transfer: typeof globalThis.fetch =
    options.fetch ??
    (async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body = init?.body;
      const bytes =
        body instanceof Uint8Array ? new Uint8Array(body) : typeof body === 'string' ? encoder.encode(body) : undefined;
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const result = await options.http.request({
        url,
        method: init?.method,
        headers,
        ...(bytes === undefined ? {} : { body: oneChunk(bytes) }),
        ...(init?.signal === undefined || init.signal === null ? {} : { signal: init.signal }),
      });
      const responseBody = new ReadableStream<Uint8Array<ArrayBuffer>>({
        async pull(controller) {
          const chunk = await result.body.next();
          if (chunk.done) {
            controller.close();
          } else {
            controller.enqueue(new Uint8Array(chunk.value));
          }
        },
        async cancel() {
          await result.body.return?.();
        },
      });
      return new Response(responseBody, {
        status: result.statusCode,
        statusText: result.statusMessage,
        headers: result.headers,
      });
    });
  const endpoint = `${options.url.replace(/\/+$/u, '')}/info/lfs/objects/batch`;

  const batch = async (
    operation: 'upload' | 'download',
    objects: readonly LfsPointer[],
    signal?: AbortSignal,
  ): Promise<readonly BatchObject[]> => {
    signal?.throwIfAborted();
    const response = await options.http.request({
      signal,
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': mediaType, Accept: mediaType },
      body: oneChunk(
        encoder.encode(
          JSON.stringify({
            operation,
            transfers: ['basic'],
            hash_algo: 'sha256',
            objects: objects.map((pointer) => ({ oid: pointer.oid, size: pointer.size })),
          }),
        ),
      ),
    });
    const body = await readAll(response.body);
    if (response.statusCode === 413) {
      throw new LfsQuotaError(quotaRefusal(body));
    }
    if (response.statusCode >= 400) {
      /* D53: a status is the remote answering. A renamed GitHub repository still
       * serves git at its old path but redirects LFS, so this is often the only
       * request that learns it moved — the proxy's typed 409 has to read as
       * `REMOTE_MOVED`, not as an opaque refusal. */
      throw remoteTransportError(
        Object.assign(new Error(`The remote refused the LFS batch request (${String(response.statusCode)}).`), {
          data: { statusCode: response.statusCode, response: body },
        }),
        options.remote === undefined ? {} : { remote: options.remote },
      );
    }
    const answers: readonly BatchObject[] = batchResponseSchema.parse(JSON.parse(body)).objects;
    const requested = new Map(objects.map((pointer) => [pointer.oid, pointer.size] as const));
    const seen = new Set<string>();
    for (const answer of answers) {
      if (seen.has(answer.oid) || requested.get(answer.oid) !== answer.size) {
        throw new Error(`The remote returned an invalid LFS batch entry for ${answer.oid}.`);
      }
      seen.add(answer.oid);
    }
    const missing = objects.find((pointer) => !seen.has(pointer.oid));
    if (missing !== undefined) {
      throw new Error(`The remote omitted large object ${missing.oid} from its LFS batch response.`);
    }
    return answers;
  };

  const refresh = async (
    operation: 'upload' | 'download',
    pointer: LfsPointer,
    signal?: AbortSignal,
  ): Promise<BatchObject> => {
    const [answer] = await batch(operation, [pointer], signal);
    if (answer === undefined || answer.error !== undefined) {
      throw new Error(`The remote refused large object ${pointer.oid}.`);
    }
    return answer;
  };

  const verifyObject = async (answer: BatchObject, signal?: AbortSignal): Promise<void> => {
    const action = answer.actions?.verify;
    if (action === undefined) {
      return;
    }
    for (let attempt = 0; attempt < transferAttempts; attempt += 1) {
      signal?.throwIfAborted();
      let status: number | undefined;
      try {
        const verified = await options.http.request({
          signal,
          url: action.href,
          method: 'POST',
          headers: { 'Content-Type': mediaType, Accept: mediaType, ...action.header },
          body: oneChunk(encoder.encode(JSON.stringify({ oid: answer.oid, size: answer.size }))),
        });
        status = verified.statusCode;
        await readAll(verified.body);
      } catch {
        signal?.throwIfAborted();
      }
      if (status !== undefined && status >= 200 && status < 300) {
        return;
      }
      if ((status !== undefined && !retryable(status)) || attempt === transferAttempts - 1) {
        throw new Error(
          `The remote did not accept large object ${answer.oid} (${String(status ?? 'network failure')}).`,
        );
      }
      await backoff(attempt, signal);
    }
  };

  const uploadObject = async (
    initial: BatchObject,
    content: Uint8Array<ArrayBuffer>,
    signal?: AbortSignal,
  ): Promise<void> => {
    let answer = initial;
    for (let attempt = 0; attempt < transferAttempts; attempt += 1) {
      signal?.throwIfAborted();
      if (attempt > 0 || (answer.actions?.upload !== undefined && expired(answer.actions.upload))) {
        answer = await refresh('upload', initial, signal);
      }
      const action = answer.actions?.upload;
      if (action === undefined) {
        return;
      }
      let response: Response | undefined;
      try {
        response = await transfer(action.href, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream', ...action.header },
          body: content,
          signal,
          credentials: 'omit',
          redirect: 'error',
        });
      } catch {
        signal?.throwIfAborted();
      }
      if (response?.status === 413) {
        throw new LfsQuotaError(quotaRefusal(await response.text()));
      }
      await response?.body?.cancel();
      if (response?.ok) {
        // Byte arrival is not finalization. Retry ambiguous verification without another PUT.
        await verifyObject(answer, signal);
        return;
      }
      if (
        (response !== undefined && response.status !== 401 && response.status !== 403 && !retryable(response.status)) ||
        attempt === transferAttempts - 1
      ) {
        throw new Error(
          `Uploading large object ${initial.oid} failed (${String(response?.status ?? 'network failure')}).`,
        );
      }
      await backoff(attempt, signal);
    }
  };

  return Object.freeze({
    upload: async ({ pointers, read, signal }: LfsUploadInput): Promise<readonly string[]> => {
      signal?.throwIfAborted();
      const { maximumUploadBytes } = options;
      if (maximumUploadBytes !== undefined && pointers.some(({ size }) => size > maximumUploadBytes)) {
        throw new Error(`Individual project files must be ${String(maximumUploadBytes / 1024 / 1024)} MiB or smaller.`);
      }
      if (pointers.length === 0) {
        return Object.freeze([]);
      }
      // Admit the whole batch before reading or transferring any bytes.
      const answers = await batch('upload', pointers, signal);
      const refused = answers.find((answer) => answer.error !== undefined);
      if (refused !== undefined) {
        throw new Error(`The remote refused large object ${refused.oid}: ${refused.error?.message}`);
      }
      const sent: string[] = [];
      for (const answer of answers) {
        signal?.throwIfAborted();
        if (answer.actions?.upload === undefined) {
          continue;
        }
        const content = await read(answer.oid);
        signal?.throwIfAborted();
        if (content.byteLength !== answer.size || lfsPointerFor(content).pointer.oid !== answer.oid) {
          throw new Error(`Large object ${answer.oid} did not hash to its own id.`);
        }
        await uploadObject(answer, content, signal);
        sent.push(answer.oid);
      }
      return Object.freeze(sent);
    },

    download: async (pointer: LfsDownloadInput): Promise<Uint8Array<ArrayBuffer>> => {
      const { signal } = pointer;
      let answer = await refresh('download', pointer, signal);
      for (let attempt = 0; attempt < transferAttempts; attempt += 1) {
        signal?.throwIfAborted();
        if (attempt > 0 || (answer.actions?.download !== undefined && expired(answer.actions.download))) {
          answer = await refresh('download', pointer, signal);
        }
        const action = answer.actions?.download;
        if (action === undefined) {
          throw new Error(`The remote has no large object ${pointer.oid}.`);
        }
        let response: Response | undefined;
        try {
          response = await transfer(action.href, {
            headers: action.header ?? {},
            signal,
            credentials: 'omit',
            redirect: 'error',
          });
        } catch {
          signal?.throwIfAborted();
        }
        if (response?.ok) {
          const reader = response.body?.getReader();
          let content: Uint8Array<ArrayBuffer> | undefined;
          let received = 0;
          let interrupted = false;
          try {
            content = new Uint8Array(pointer.size);
            let complete = false;
            while (!complete) {
              signal?.throwIfAborted();
              const chunk = await reader?.read();
              complete = chunk === undefined || chunk.done;
              if (chunk === undefined || chunk.done) {
                break;
              }
              if (received + chunk.value.byteLength > pointer.size) {
                throw new RangeError(`Large object ${pointer.oid} exceeds its declared size.`);
              }
              content.set(chunk.value, received);
              received += chunk.value.byteLength;
            }
          } catch (error) {
            signal?.throwIfAborted();
            if (error instanceof RangeError) {
              throw error;
            }
            interrupted = true;
          } finally {
            await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
          }
          if (!interrupted && content !== undefined) {
            if (received !== pointer.size || lfsPointerFor(content).pointer.oid !== pointer.oid) {
              throw new Error(`Large object ${pointer.oid} did not hash to its own id.`);
            }
            return content;
          }
        } else {
          await response?.body?.cancel();
          if (
            response !== undefined &&
            response.status !== 401 &&
            response.status !== 403 &&
            !retryable(response.status)
          ) {
            throw new Error(`Downloading large object ${pointer.oid} failed (${String(response.status)}).`);
          }
        }
        if (attempt === transferAttempts - 1) {
          throw new Error(`Downloading large object ${pointer.oid} failed after three attempts.`);
        }
        await backoff(attempt, signal);
      }
      throw new Error(`Downloading large object ${pointer.oid} failed.`);
    },
  });
};
