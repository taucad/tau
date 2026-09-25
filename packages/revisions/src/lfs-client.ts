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
}>;

/** One project's LFS transport. @public */
export type LfsClient = Readonly<{
  /** Upload every object the remote does not already hold. Resolves to the oids sent. */
  upload: (objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>>) => Promise<readonly string[]>;
  /** Fetch one object's bytes by its pointer. */
  download: (pointer: LfsPointer) => Promise<Uint8Array<ArrayBuffer>>;
}>;

const mediaType = 'application/vnd.git-lfs+json';

type BatchAction = Readonly<{ href: string; header?: Readonly<Record<string, string>> }>;
type BatchObject = Readonly<{
  oid: string;
  size: number;
  actions?: Readonly<{ upload?: BatchAction; download?: BatchAction; verify?: BatchAction }>;
  error?: Readonly<{ code: number; message: string }>;
}>;
const batchActionSchema = z.object({ href: z.url(), header: z.record(z.string(), z.string()).optional() });
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
 * await lfs.upload(new Map([['a'.repeat(64), new Uint8Array(new ArrayBuffer(8))]]));
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
      });
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      let size = 0;
      for await (const chunk of result.body) {
        const owned = new Uint8Array(chunk);
        chunks.push(owned);
        size += owned.byteLength;
      }
      const responseBody = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        responseBody.set(chunk, offset);
        offset += chunk.byteLength;
      }
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
  ): Promise<readonly BatchObject[]> => {
    const response = await options.http.request({
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

  return Object.freeze({
    upload: async (objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>>): Promise<readonly string[]> => {
      const pointers = [...objects].map(([oid, content]) => Object.freeze({ oid, size: content.byteLength }));
      if (pointers.length === 0) {
        return Object.freeze([]);
      }
      const answers = await batch('upload', pointers);
      const sent: string[] = [];
      for (const answer of answers) {
        if (answer.error !== undefined) {
          throw new Error(`The remote refused large object ${answer.oid}: ${answer.error.message}`);
        }
        const action = answer.actions?.upload;
        /* No action means the remote already holds it. That, and not a Tau
         * ledger, is what makes one object one upload (V13). */
        if (action === undefined) {
          continue;
        }
        const content = objects.get(answer.oid);
        if (content === undefined) {
          throw new Error(`The remote asked for large object ${answer.oid}, which is not in this push.`);
        }
        /* oxlint-disable-next-line no-await-in-loop -- one transfer at a time:
         * it bounds concurrent sockets and makes a 413 deterministic (the first
         * object over the plan is the one the refusal names). It does *not*
         * bound memory: the caller hands this map in already resident, so the
         * ceiling is one directory read earlier, in the adapter — W13 scopes the
         * upload to the refs being pushed and streams each object from disk. */
        const response = await transfer(action.href, {
          method: 'PUT',
          /* The presigned URL signs `application/octet-stream`, and otherwise
           * exactly the headers the batch issued: the URL is the credential,
           * and a second one only leaks (W11a §10). */
          headers: { 'Content-Type': 'application/octet-stream', ...action.header },
          body: content,
        });
        if (response.status === 413) {
          // oxlint-disable-next-line no-await-in-loop -- reading the refusal that ends this loop.
          const body = await response.text();
          throw new LfsQuotaError(quotaRefusal(body));
        }
        if (!response.ok) {
          throw new Error(`Uploading large object ${answer.oid} failed (${String(response.status)}).`);
        }
        /* The server counts an object against the plan when the client says it
         * landed, so skipping `verify` would under-report every upload (W11a
         * §9.6).
         *
         * Unlike the transfer, this is a *Tau* route behind the API's own auth
         * guard — so it goes through the Tau client, which carries the session
         * (a cookie in the browser, a bearer on a disk host), plus whatever
         * header the batch issued for it. Sent through a bare `fetch` it arrives
         * with no credential at all and the guard refuses it, failing the push
         * after the object has already landed. */
        const verify = answer.actions?.verify;
        if (verify !== undefined) {
          // oxlint-disable-next-line no-await-in-loop -- one object at a time, see above.
          const verified = await options.http.request({
            url: verify.href,
            method: 'POST',
            headers: { 'Content-Type': mediaType, Accept: mediaType, ...verify.header },
            body: oneChunk(encoder.encode(JSON.stringify({ oid: answer.oid, size: answer.size }))),
          });
          if (verified.statusCode >= 400) {
            throw new Error(`The remote did not accept large object ${answer.oid} (${String(verified.statusCode)}).`);
          }
        }
        sent.push(answer.oid);
      }
      return Object.freeze(sent);
    },

    download: async (pointer: LfsPointer): Promise<Uint8Array<ArrayBuffer>> => {
      const [answer] = await batch('download', [pointer]);
      const action = answer?.actions?.download;
      if (action === undefined) {
        throw new Error(`The remote has no large object ${pointer.oid}.`);
      }
      const response = await transfer(action.href, { headers: action.header ?? {} });
      if (!response.ok) {
        throw new Error(`Downloading large object ${pointer.oid} failed (${String(response.status)}).`);
      }
      const content = new Uint8Array(await response.arrayBuffer());
      /* Content-addressed both ways: a store that hands back the wrong bytes is
       * caught here rather than in a tree id hours later. */
      if (content.byteLength !== pointer.size || lfsPointerFor(content).pointer.oid !== pointer.oid) {
        throw new Error(`Large object ${pointer.oid} did not hash to its own id.`);
      }
      return content;
    },
  });
};
