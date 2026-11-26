/**
 * This device's own chat segment, read from the file (host attachment reliability HA1, HA-I1): `events.jsonl` folded
 * through the agent host's facts-only replay into the chat's projection, so reading a chat never waits on a host.
 *
 * - **Single flight:** one read at a time; a wake during a read runs one more after it.
 * - **Prefix guard (HA-I3):** the held view is extended while its bytes stay a prefix of the file's; otherwise it is
 *   rebuilt and published whole as a `catch-up`, so a reset never blanks the transcript.
 * - **Authority (HA-I3a):** an absent or empty log is judged against `chat.json` from the same root in the same pass.
 * - **Settler span (HA-I5):** while an own run is unsettled, each poll checks whether the newest row and the writer
 *   marker's mtime both look stale; once they have looked stale continuously for `2 × runHeartbeatMilliseconds` on
 *   the page's monotonic clock, it asks for an in-page `attach` on every poll until the run settles.
 *
 * Loaded lazily by the chat store on the first observed chat.
 *
 * @module
 */
import {
  createReplayFacts,
  foreignRunStaleMilliseconds,
  isBytePrefix,
  runHeartbeatMilliseconds,
} from '@taucad/agent-host';
import type { ProjectionBatch, ReplayFacts } from '@taucad/agent-host';
import { agentWireLimits } from '@taucad/agent-host/wire';
import { getErrno } from '@taucad/utils/error';
import { randomUuid } from '@taucad/utils/id';
import { initialChatProjection, reduceChatProjection, selectRunPhase } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent } from '#machines/chat-projection.logic.js';

/** How often an unsettled own run's segment is read again while the page is visible. Milliseconds. @public */
export const unsettledReadPollMilliseconds = 1000;

/**
 * How long a suspect read (held rows with an absent log, or a shrink past the last row) is kept before it is judged:
 * an absent log is missing (R8), a shrink is taken as the file's truth (`own.rewrite`). Milliseconds. @public
 */
export const readRefusalMilliseconds = 30_000;

/** What a pass decided about the chat's own segment (HA-I3a). @public */
export type OwnSegmentVerdict =
  /** The projection holds the file: its own rows, or an authoritative empty own read. */
  | 'current'
  /** Held rows, and the log has been absent past {@link readRefusalMilliseconds} with the record present (R8). */
  | 'missing'
  /** No record, no own log and no `events/`, and nothing held: not a chat. */
  | 'not-a-chat'
  /** The record says the chat was purged. */
  | 'deleted'
  /** The file or the record could not be read (a root not mounted): the source keeps what it holds and reads again. */
  | 'unreadable';

/**
 * What a `current` verdict stands on: own rows, or an empty own log under a present `chat.json`, or (record absent)
 * the foreign segments in the chat's `events/` directory, judged as `readChatDirectory` judges a chat (AR4-3). @public
 */
export type OwnSegmentBasis = 'rows' | 'record' | 'segments';

/** The files the source reads: the store's worker filesystem client. @public */
export type OwnSegmentClient = Readonly<{
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  readdir: (path: string) => Promise<readonly string[]>;
  stat?: ((path: string) => Promise<Readonly<{ mtimeMs?: number | undefined }>>) | undefined;
}>;

/** @public */
export type OwnSegmentSourceInput = Readonly<{
  chatId: string;
  /** The chat's directory, `/projects/<projectId>/.tau/chats/<chatId>`. */
  directory: string;
  client: () => OwnSegmentClient;
  projection: Readonly<{
    getSnapshot: () => Readonly<{ context: ChatProjection }>;
    send: (event: Extract<ChatProjectionEvent, { type: 'facts' | 'catch-up' }>) => void;
  }>;
  /** A pass decided; `current` is read authority (the store's answered log read). */
  onVerdict: (verdict: OwnSegmentVerdict, basis?: OwnSegmentBasis) => void;
  /** A persistent shrink was taken as the file's truth (HA0 `own.rewrite`). */
  onRewrite?: () => void;
  /** The settler span completed: send `attach` to the in-page host (HA-I5). */
  onStaleRun: () => void;
  /** Wall clock and monotonic clock; `Date.now` and `performance.now` by default. */
  now?: () => number;
  monotonicNow?: () => number;
  /** Whether the page is visible; polls run only then. */
  visible?: () => boolean;
}>;

/** @public */
export type OwnSegmentSource = Readonly<{
  /** Read again: a watch, a live event, a command answer, a page wake or a poll. */
  wake: () => void;
  stop: () => void;
}>;

const page = { limit: agentWireLimits.batchRows, maxBytes: agentWireLimits.batchBytes } as const;
const ended: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled', 'none']);

/** Every page of a view from `cursor`. */
const pagesOf = (view: ReplayFacts, chatId: string, cursor: number): ProjectionBatch[] => {
  const pages: ProjectionBatch[] = [];
  let next = cursor;
  do {
    const batch = view.projectionBatch({ chatId, cursor: next, ...page });
    pages.push(batch);
    next = batch.nextCursor;
    if (batch.facts.length === 0) {
      break;
    }
  } while (next < pages.at(-1)!.endCursor);
  return pages;
};

/** When the newest row was recorded, by the wall clock; `undefined` for an empty view. */
const newestRowAt = (view: ReplayFacts, chatId: string): number | undefined => {
  const end = view.projectionBatch({ chatId, cursor: 0, limit: 0, maxBytes: 0 }).endCursor;
  const last = end === 0 ? undefined : view.projectionBatch({ chatId, cursor: end - 1, limit: 1, maxBytes: 0 });
  const at = last?.facts[0]?.row.recordedAt;
  return at === undefined ? undefined : Date.parse(at);
};

/** The byte offset where the held bytes' last row starts: the appender's whole shrink window (HA-I3a). */
const lastRowStart = (bytes: Uint8Array<ArrayBuffer>): number => {
  let index = bytes.byteLength - 2;
  while (index >= 0 && bytes[index] !== 0x0a) {
    index -= 1;
  }
  return index + 1;
};

const isNotFound = (error: unknown): boolean => {
  const code = getErrno(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
};

/**
 * Follow one chat's own segment from the file.
 *
 * @param input - The chat, its directory, the filesystem client, the projection and the callbacks.
 * @returns The source; it reads at once.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- One source: its read pass, span and poll share the closure.
export const createOwnSegmentSource = (input: OwnSegmentSourceInput): OwnSegmentSource => {
  const { chatId, directory } = input;
  const now = input.now ?? Date.now;
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const visible = input.visible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible');
  let view: ReplayFacts | undefined;
  let stopped = false;
  /* Read through a call: `stopped` changes across awaits, which narrowing cannot see. */
  const isStopped = (): boolean => stopped;
  const isUnreadable = (): boolean => unreadable;
  const runAgain = (): boolean => again && !stopped;
  let reading: Promise<void> | undefined;
  let again = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  /** When a suspect read was first seen, on the monotonic clock. */
  let suspectSince: number | undefined;
  /* A held log that went missing was said once; the next read that holds rows again lifts it. */
  let missingSaid = false;
  /* The last pass could not read: the poll reads again, so a failed first read never strands the chat. */
  let unreadable = false;
  /** The settler span (HA-I5): when it started, and the row and mtime it last saw. */
  let staleSince: number | undefined;
  let lastChange: string | undefined;

  const projection = (): ChatProjection => input.projection.getSnapshot().context;

  /** Publish the whole view atomically, in place of whatever the projection holds (a rebuild). */
  const publishWhole = (next: ReplayFacts): void => {
    let staged = initialChatProjection;
    for (const batch of pagesOf(next, chatId, 0)) {
      staged = reduceChatProjection(staged, { type: 'facts', answer: batch }).state;
    }
    const base = projection();
    input.projection.send({
      type: 'catch-up',
      base,
      projection: { ...staged, sourceHealth: next.sourceHealth },
    });
  };

  const publishFrom = (next: ReplayFacts, previous: ReplayFacts): void => {
    const { cursor, sourceGeneration } = projection().ledger.position;
    const health = projection().sourceHealth;
    if (
      sourceGeneration !== previous.generation ||
      health?.historyIntact !== next.sourceHealth.historyIntact ||
      health.newerHistory !== next.sourceHealth.newerHistory ||
      health.quarantined !== next.sourceHealth.quarantined
    ) {
      publishWhole(next);
      return;
    }
    for (const batch of pagesOf(next, chatId, cursor)) {
      if (batch.facts.length > 0) {
        input.projection.send({ type: 'facts', answer: batch });
      }
    }
  };

  /** What `chat.json` and `events/` say about a chat whose own log is absent or empty (HA-I3a). */
  const judgeAbsence = async (): Promise<'record' | 'segments' | 'absent' | 'purged'> => {
    const client = input.client();
    try {
      const record = JSON.parse(new TextDecoder().decode(await client.readFile(`${directory}/chat.json`))) as {
        readonly purgedAt?: unknown;
      };
      return record.purgedAt === undefined ? 'record' : 'purged';
    } catch (error) {
      if (!isNotFound(error) && !(error instanceof SyntaxError)) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        return 'record';
      }
    }
    try {
      const names = await client.readdir(`${directory}/events`);
      return names.some((name) => name.endsWith('.jsonl')) ? 'segments' : 'absent';
    } catch (error) {
      if (isNotFound(error)) {
        return 'absent';
      }
      throw error;
    }
  };

  /** Whether a suspect read has outlasted its bound; starts the bound on first sight. */
  const suspectExpired = (): boolean => {
    suspectSince ??= monotonicNow();
    return monotonicNow() - suspectSince >= readRefusalMilliseconds;
  };

  const readOnce = async (): Promise<void> => {
    const client = input.client();
    let bytes: Uint8Array<ArrayBuffer> | undefined;
    try {
      bytes = await client.readFile(`${directory}/events.jsonl`);
    } catch (error) {
      if (!isNotFound(error)) {
        unreadable = true;
        input.onVerdict('unreadable'); // A root not mounted: keep what is held and read again (U14, U26).
        return;
      }
    }
    if (stopped) {
      return;
    }
    const held = view !== undefined && view.bytes.byteLength > 0;
    if (bytes === undefined || bytes.byteLength === 0) {
      let record: Awaited<ReturnType<typeof judgeAbsence>>;
      try {
        record = await judgeAbsence();
      } catch {
        unreadable = true;
        input.onVerdict('unreadable'); // Nothing readable: a read failure, retried on the next wake.
        return;
      }
      if (isStopped()) {
        return;
      }
      if (record === 'purged') {
        input.onVerdict('deleted');
        return;
      }
      if (held) {
        /* Held rows with an absent log stay suspect: a fetch rewrite during a project switch never blanks own turns.
         * Once said, `missing` stands until rows return, and the 1 Hz re-read stops. */
        if (!missingSaid && suspectExpired()) {
          suspectSince = undefined;
          missingSaid = true;
          input.onVerdict('missing');
        }
        return;
      }
      if (record === 'absent') {
        input.onVerdict('not-a-chat');
        return;
      }
      suspectSince = undefined;
      const empty = createReplayFacts(new Uint8Array(new ArrayBuffer(0)), `own-${randomUuid()}`);
      if (view === undefined || projection().ledger.position.cursor > 0) {
        publishWhole(empty);
      }
      view = empty;
      missingSaid = false;
      input.onVerdict('current', record);
      return;
    }
    if (view !== undefined && isBytePrefix(view.bytes, bytes)) {
      const previous = view;
      view = view.extend(bytes);
      suspectSince = undefined;
      if (view.generation === previous.generation) {
        publishFrom(view, previous);
      } else {
        publishWhole(view);
      }
      missingSaid = false;
      input.onVerdict('current', 'rows');
      return;
    }
    if (view !== undefined) {
      const start = lastRowStart(view.bytes);
      const withinWindow = bytes.byteLength >= start && isBytePrefix(view.bytes.subarray(0, start), bytes);
      if (!withinWindow && !suspectExpired()) {
        return;
      }
      if (!withinWindow) {
        input.onRewrite?.();
      }
    }
    suspectSince = undefined;
    view = createReplayFacts(bytes, `own-${randomUuid()}`);
    publishWhole(view);
    missingSaid = false;
    input.onVerdict('current', 'rows');
  };

  /** HA-I5: whether an unsettled own run has looked stale long enough for an in-page `attach`. */
  const checkSpan = async (): Promise<boolean> => {
    const phase = selectRunPhase(projection());
    if (view === undefined || ended.has(phase)) {
      staleSince = undefined;
      lastChange = undefined;
      return false;
    }
    const rowAt = newestRowAt(view, chatId);
    const markerAt = await input
      .client()
      .stat?.(`${directory}/events.jsonl.lock`)
      .then(
        (stat) => stat.mtimeMs,
        () => undefined,
      );
    const change = `${String(rowAt)}:${String(markerAt)}`;
    if (change !== lastChange) {
      /* Any change restarts the span: a live writer's touch can never let it complete. */
      lastChange = change;
      staleSince = undefined;
    }
    if (now() - Math.max(rowAt ?? 0, markerAt ?? 0) < foreignRunStaleMilliseconds) {
      staleSince = undefined;
      return true;
    }
    /* Never backdated: the span starts at the first poll that sees the run stale, so a sleep cannot complete it. */
    staleSince ??= monotonicNow();
    if (monotonicNow() - staleSince >= 2 * runHeartbeatMilliseconds) {
      input.onStaleRun();
    }
    return true;
  };

  const run = async (): Promise<void> => {
    do {
      again = false;
      unreadable = false;
      // oxlint-disable-next-line no-await-in-loop -- single flight: a wake during a read runs one more after it.
      await readOnce();
      // oxlint-disable-next-line no-await-in-loop -- the span reads the view this pass left.
      const unsettled = isStopped() ? false : await checkSpan();
      clearTimeout(poll);
      poll = undefined;
      if (!isStopped() && (unsettled || suspectSince !== undefined || isUnreadable()) && visible()) {
        poll = setTimeout(wake, unsettledReadPollMilliseconds); // Bound: unsettledReadPollMilliseconds.
      }
    } while (runAgain());
  };

  const runOnce = async (): Promise<void> => {
    try {
      await run();
    } finally {
      reading = undefined;
    }
  };

  const wake = (): void => {
    if (stopped) {
      return;
    }
    if (reading !== undefined) {
      again = true;
      return;
    }
    reading = runOnce();
  };

  const onPage = (): void => {
    wake();
  };
  /* `visibilitychange` fires on the document; `pageshow` and `online` on the window. Absent outside a page. */
  const targets: ReadonlyArray<readonly [EventTarget | undefined, string]> = [
    [typeof document === 'undefined' ? undefined : document, 'visibilitychange'],
    [typeof globalThis.addEventListener === 'function' ? globalThis : undefined, 'pageshow'],
    [typeof globalThis.addEventListener === 'function' ? globalThis : undefined, 'online'],
  ];
  for (const [target, type] of targets) {
    target?.addEventListener(type, onPage);
  }
  wake();
  return {
    wake,
    stop: () => {
      stopped = true;
      clearTimeout(poll);
      for (const [target, type] of targets) {
        target?.removeEventListener(type, onPage);
      }
    },
  };
};
