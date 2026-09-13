/**
 * The last word a closing document gets: re-sending one already-built push
 * under `keepalive` (A32, S41, review 3 F5).
 *
 * A smart-HTTP push is two round trips over asynchronous object reads, and
 * neither can *start* after the document is gone. So nothing here builds a
 * pack. The pack is the one the `hidden` flush already built — `hidden` is the
 * real close, the page is still alive there, and `await` still means something —
 * and this module keeps a copy of that POST so `pagehide` can offer it again
 * with `keepalive: true`, which is the only way a request outlives its
 * document.
 *
 * ponytail: keepalive carries a precomputed single POST, ≤64 KiB, history refs
 * only. Never chats — a record ref is pushed on its own and its refusal blocks
 * nothing — and never LFS, whose transfers are separate requests to a different
 * origin and could not be replayed from one recorded body anyway.
 *
 * Offering the same receive-pack body twice is safe: the commands inside it
 * carry their own expected-old values, so the second offer either lands (the
 * first never arrived) or is answered `up to date` / refused (it did). That is
 * the same lease every other push is made under (P18).
 */

import { concatBytes } from '#object-hash.js';
import { createRevisionHttpClient, keepaliveLimitBytes } from '#http-client.js';
import type { RevisionHttpClient, RevisionHttpRequest } from '#http-client.js';

/*
 * The body type the client already declares, read from it rather than restated.
 *
 * `isomorphic-git` types its bodies as `ArrayBufferLike`, and `http-client.ts`
 * is the one place in Tau that says so — writing it a second time here would
 * need the same two mutually exclusive lint rules disabled again.
 */
type GitBody = NonNullable<RevisionHttpRequest['body']>;

/** One push POST, already serialized, ready to be offered again. @public */
export type RecordedPush = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  /** The receive-pack request body: the pkt-line commands plus the packfile. */
  body: Uint8Array<ArrayBuffer>;
}>;

/** A client that remembers the one push its caller asked it to remember. @public */
export type PushRecorder = Readonly<{
  /** Pass this to the port in place of the client it wraps. */
  client: RevisionHttpClient;
  /**
   * Remember the POST this call makes — and only this call's (review 2 R3).
   *
   * The scheduler wraps its **history-set** push in this, so the body
   * `pagehide` may offer again is the history pack D28/S41 name and never a
   * chat ref's own push, which is a receive-pack POST like any other.
   */
  record: <Result>(run: () => Promise<Result>) => Promise<Result>;
  /** The last push POST recorded this way, or `undefined` before the first. */
  last: () => RecordedPush | undefined;
}>;

/** How one `keepalive` re-send ended. @public */
export type KeepalivePushOutcome =
  /** The platform accepted the request; the answer may never be read. */
  | Readonly<{ status: 'sent'; bytes: number }>
  /**
   * Over the platform's 64 KiB cap, and therefore **not** sent.
   *
   * Both numbers, because the only honest thing to tell a person is "this much
   * was not backed up"; the browser would have dropped it with no diagnosis at
   * all (A39).
   */
  | Readonly<{
      status: 'refused';
      reason: string;
      bytes: number;
      limitBytes: number;
      /** Derived, not a second decision: whether the cap is why it was refused. */
      overBound: boolean;
    }>
  /** Nothing was ever built, so there is nothing to offer again. */
  | Readonly<{ status: 'nothingToSend' }>;

/*
 * The one request in a push that carries the pack.
 *
 * Not a URL test: which ref set a receive-pack POST carries is not in its URL —
 * every ref is pushed to the same endpoint — so the *caller* says which push is
 * the history one and this only picks the request that has a body (the
 * advertisement that precedes it is a GET).
 */
const carriesPack = (request: RevisionHttpRequest): boolean =>
  (request.method ?? 'GET').toUpperCase() === 'POST' && request.body !== undefined;

const replay = (body: Uint8Array<ArrayBuffer>): GitBody => {
  const once = (async function* iterate(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    yield body;
  })();
  return once;
};

/**
 * Wrap a client so one push it carries can be offered again.
 *
 * Nothing is recorded unless a caller asks: {@link PushRecorder.record} arms the
 * wrapper for the duration of one call, which is how the history set's push —
 * and never a chat ref's — is what `pagehide` re-sends (review 2 R3).
 *
 * The body is collected rather than observed, because an async iterator is
 * consumed once: the recorder hands the wrapped client a fresh iterator over the
 * same bytes. Push bodies are already fully in memory by the time the library
 * hands them over, so this adds no allocation the push did not already make.
 *
 * @param client - The client the port would otherwise use.
 * @returns The wrapping client, the arming call, and a reader for the last push.
 * @public
 *
 * @example <caption>A browser worker's close flush</caption>
 * ```typescript
 * import { createRevisionHttpClient, recordLastPush, sendKeepalivePush } from '@taucad/revisions';
 *
 * const recorder = recordLastPush(createRevisionHttpClient({ credentials: 'include' }));
 * // … build the port with `recorder.client`, pass `recorder.record` as the
 * // scheduler's `recordHistoryPush`, then on `pagehide`:
 * const outcome = await sendKeepalivePush(recorder.last(), { credentials: 'include' });
 * ```
 */
export const recordLastPush = (client: RevisionHttpClient): PushRecorder => {
  let last: RecordedPush | undefined;
  /* A counter, not a boolean: the scheduler's own pushes are sequential, but a
   * host that ever overlapped two would otherwise disarm the outer one. */
  let armed = 0;
  return Object.freeze({
    last: () => last,
    record: async <Result>(run: () => Promise<Result>): Promise<Result> => {
      armed += 1;
      try {
        return await run();
      } finally {
        armed -= 1;
      }
    },
    client: Object.freeze({
      request: async (request: RevisionHttpRequest) => {
        if (armed === 0 || !carriesPack(request) || request.body === undefined) {
          return client.request(request);
        }
        const chunks: Array<Uint8Array<ArrayBuffer>> = [];
        for await (const chunk of request.body) {
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- every chunk the library produces is `ArrayBuffer`-backed.
          chunks.push(chunk as Uint8Array<ArrayBuffer>);
        }
        const body = concatBytes(...chunks);
        last = Object.freeze({ url: request.url, headers: request.headers ?? {}, body });
        return client.request({ ...request, body: replay(body) });
      },
    }),
  });
};

/** What the re-send needs from its host: the same credential rules as any push. @public */
export type KeepalivePushOptions = Readonly<{
  credentials?: RequestCredentials;
  authorization?: (url: string) => string | undefined | Promise<string | undefined>;
  proxyAuthorization?: (url: string) => string | undefined | Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}>;

/**
 * Offer one recorded push again, under `keepalive`.
 *
 * The bound is not checked here: `createRevisionHttpClient` refuses a body over
 * {@link keepaliveLimitBytes} with both numbers in its message, and this turns
 * that refusal into an outcome a scheduler can record — which is the difference
 * between *Not backed up · 1* and a silent drop.
 *
 * @param recorded - The push the `hidden` flush built, from {@link PushRecorder.last}.
 * @param options - The host's credential rules.
 * @returns Whether the platform took it, and how many bytes were involved.
 * @public
 */
export const sendKeepalivePush = async (
  recorded: RecordedPush | undefined,
  options: KeepalivePushOptions = {},
): Promise<KeepalivePushOutcome> => {
  if (recorded === undefined) {
    return { status: 'nothingToSend' };
  }
  const bytes = recorded.body.byteLength;
  const client = createRevisionHttpClient({ ...options, keepalive: true });
  try {
    await client.request({
      url: recorded.url,
      method: 'POST',
      headers: recorded.headers,
      body: replay(recorded.body),
    });
    return { status: 'sent', bytes };
  } catch (error) {
    return {
      status: 'refused',
      reason: error instanceof Error ? error.message : 'The last backup could not be sent.',
      bytes,
      limitBytes: keepaliveLimitBytes,
      overBound: bytes > keepaliveLimitBytes,
    };
  }
};
