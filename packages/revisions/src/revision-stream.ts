/**
 * The client half of a project's `revision` stream (charter D13, policy rule 9).
 *
 * While a project is open, the API appends one `revision.committed` entry per
 * committed manifest to the project's durable-events stream and wakes readers
 * parked on the existing HTTP long poll. This loop is that reader: it learns the
 * stream's tail, then long-polls past it and reports each page of entries as
 * one move. An entry is a wake-up, never a payload — the bytes come from the
 * `git fetch` the move starts — so a duplicate or a missed entry costs at most
 * one fetch.
 *
 * A refusal the person has to act on (401, 403, 404, 410) ends the loop and is
 * handed to the one remote-refusal classifier (rule 19); anything else backs off
 * and tries again.
 */

import { remoteTransportError, tauRemoteName } from '#remotes.js';
import type { TauCloudAuth } from '#remotes.js';
import type { RevisionPortError } from '#revision-port.js';

/**
 * The durable-events stream id of one project's `revision` entries.
 *
 * One of exactly two copies, as the ceiling marker has two: the API's
 * `revisionStreamId` in `apps/api/app/api/durable-events/durable-events.types.ts`
 * is the source, this package does not depend on the API, and each copy is
 * pinned by its own test so the two change together.
 *
 * @param projectId - The project, as the API knows it.
 * @returns `revision:<projectId>`.
 * @public
 */
export const revisionStreamId = (projectId: string): string => `revision:${projectId}`;

/** One wake-up: the newest generation a page announced and every ref it moved. @public */
export type RevisionStreamMove = Readonly<{ generation: number; refs: readonly string[] }>;

/** What the loop tells its host. @public */
export type RevisionStreamHandlers = Readonly<{
  moved: (move: RevisionStreamMove) => void;
  /**
   * Called once, when the first read of the tail has settled either way: from
   * here on a push is an entry. A host's open pull waits for it, so a push
   * between the two reads is never missed (D13).
   */
  watching?: () => void;
  /** The stream refused this reader; the loop has stopped. */
  refused: (error: RevisionPortError) => void;
}>;

/** Where the loop reads from, and as whom. @public */
export type RevisionStreamOptions = Readonly<{
  projectId: string;
  /** Read per request; `undefined` waits out one backoff and asks again. */
  apiBaseUrl: () => string | undefined;
  /** Read per request, so a refreshed session takes effect on the next poll. */
  auth: () => TauCloudAuth | undefined;
  fetch?: typeof globalThis.fetch;
  /** First wait after a failed poll; doubles per failure. Defaults to 1 s. */
  retryMilliseconds?: number;
  /** Where the doubling stops. Defaults to 30 s. */
  maxRetryMilliseconds?: number;
  /**
   * How long one request may take before this reader abandons it and asks
   * again (RV-W5b F6): a half-open connection otherwise parks the loop for good.
   * Defaults to the long poll plus 10 s.
   */
  requestTimeoutMilliseconds?: number;
}>;

/* The API's ceiling for one long poll (`durable-events.dto.ts`). */
const longPollMilliseconds = 25_000;

/* The statuses no retry can satisfy; the classifier names each. */
const refusedStatuses: ReadonlySet<number> = new Set([401, 403, 404, 410]);

type StreamPage = Readonly<{ nextSequence: number; moves: readonly RevisionStreamMove[] }>;

const pageOf = (body: unknown): StreamPage | undefined => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a response body is `unknown` until read.
  const page = (body ?? {}) as Readonly<{ nextSequence?: unknown; events?: unknown }>;
  if (typeof page.nextSequence !== 'number') {
    return undefined;
  }
  const events: readonly unknown[] = Array.isArray(page.events) ? page.events : [];
  const moves = events.flatMap((event): readonly RevisionStreamMove[] => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- each field is checked below.
    const entry = (event ?? {}) as Readonly<{
      type?: unknown;
      payload?: Readonly<{ generation?: unknown; refs?: unknown }>;
    }>;
    const { generation, refs } = entry.payload ?? {};
    return entry.type === 'revision.committed' &&
      typeof generation === 'number' &&
      Array.isArray(refs) &&
      refs.every((ref) => typeof ref === 'string')
      ? [{ generation, refs }]
      : [];
  });
  return { nextSequence: page.nextSequence, moves };
};

const delay = async (milliseconds: number, signal: AbortSignal): Promise<void> => {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
};

/**
 * Long-poll one project's `revision` stream until stopped or refused.
 *
 * @param options - The project, where the API is and how to authenticate.
 * @param handlers - Called per page of entries, and once on a refusal.
 * @returns The stop function; it aborts the poll in flight.
 * @public
 *
 * @example <caption>Wake a project when another device pushes</caption>
 * ```typescript
 * import { watchRevisionStream } from '@taucad/revisions';
 *
 * const stop = watchRevisionStream(
 *   { projectId: 'p1', apiBaseUrl: () => 'https://api.tau.new', auth: () => ({ kind: 'cookie' }) },
 *   { moved: (move) => console.info(move.refs), refused: (error) => console.warn(error.code) },
 * );
 * stop();
 * ```
 */
export const watchRevisionStream = (options: RevisionStreamOptions, handlers: RevisionStreamHandlers): (() => void) => {
  const controller = new AbortController();
  const { signal } = controller;
  /* Read fresh after every await: `stop` can land while a poll is in flight. */
  const stopped = (): boolean => signal.aborted;
  let announced = false;
  const announce = (): void => {
    if (!announced) {
      announced = true;
      handlers.watching?.();
    }
  };
  const fetcher = options.fetch ?? globalThis.fetch;
  const retry = options.retryMilliseconds ?? 1000;
  const maxRetry = options.maxRetryMilliseconds ?? 30_000;
  const requestTimeout = options.requestTimeoutMilliseconds ?? longPollMilliseconds + 10_000;

  const poll = async (): Promise<void> => {
    /* Undefined until the tail is known: entries before it are the open pull's. */
    let after: number | undefined;
    let failures = 0;
    while (!stopped()) {
      const apiBaseUrl = options.apiBaseUrl();
      const auth = options.auth();
      try {
        if (apiBaseUrl === undefined || auth === undefined) {
          throw new Error('This host is not signed in to Tau Cloud.');
        }
        const url = new URL(
          `${apiBaseUrl.replace(/\/$/u, '')}/v1/streams/${encodeURIComponent(revisionStreamId(options.projectId))}/events`,
        );
        url.searchParams.set('afterSequence', String(after ?? 0));
        if (after === undefined) {
          url.searchParams.set('limit', '1');
        }
        url.searchParams.set('longPollDuration', String(after === undefined ? 0 : longPollMilliseconds));
        // oxlint-disable-next-line no-await-in-loop -- one poll at a time is the protocol.
        const response = await fetcher(url, {
          method: 'GET',
          ...(auth.kind === 'cookie' ? { credentials: 'include' } : {}),
          /* eslint-disable @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire. */
          headers: {
            Accept: 'application/json',
            ...(auth.kind === 'bearer' ? { Authorization: auth.authorization } : {}),
          },
          /* eslint-enable @typescript-eslint/naming-convention -- end wire header names. */
          signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeout)]),
        });
        if (refusedStatuses.has(response.status)) {
          // oxlint-disable-next-line no-await-in-loop -- the last read before the loop ends.
          const text = await response.text().catch(() => '');
          /* A reader stopped while the body was read has nobody to tell (RV-W5b F3). */
          if (stopped()) {
            return;
          }
          announce();
          handlers.refused(
            remoteTransportError({ data: { statusCode: response.status, response: text } }, { remote: tauRemoteName }),
          );
          return;
        }
        if (!response.ok) {
          throw new Error(`The revision stream answered ${String(response.status)}.`);
        }
        // oxlint-disable-next-line no-await-in-loop -- the page this poll answered.
        const page = pageOf(await response.json());
        if (page === undefined) {
          throw new Error('The revision stream answered without a sequence.');
        }
        const [first, ...rest] = page.moves;
        if (after !== undefined && first !== undefined && !stopped()) {
          /* One wake-up per page: the fetch it starts reads every ref anyway. */
          handlers.moved({
            generation: Math.max(first.generation, ...rest.map((move) => move.generation)),
            refs: [...new Set([first, ...rest].flatMap((move) => move.refs))],
          });
        }
        after = page.nextSequence;
        failures = 0;
        announce();
      } catch {
        if (stopped()) {
          return;
        }
        failures += 1;
        /* No tail to wait for: the open pull goes ahead rather than wait out a backoff. */
        announce();
        /* Jittered (RV-W5b F6): every tab of one outage does not come back on the same beat. */
        // oxlint-disable-next-line no-await-in-loop -- the backoff is the loop's own pace.
        await delay(Math.min(retry * 2 ** (failures - 1), maxRetry) * (0.5 + Math.random() / 2), signal);
      }
    }
  };
  // async-iife: bootstrap -- the loop settles every failure itself; `stop` ends it.
  void poll();
  return () => {
    controller.abort();
  };
};
