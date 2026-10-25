import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import { isAbandonedTurn } from '#log/event-types.js';
import type { AgentLogEvent, RowKey, RunLifecycleState, UserProviderMessage } from '#log/event-types.js';
import { parseLogSegments } from '#log/segments.js';
import { parseEventLogBytes } from '#log/serialization.js';
import type { ChatLogSegment, ParsedLogSegment } from '#log/segments.js';

/**
 * Another device's run that has not settled, as that device's synced segment holds it (XD3, cross-device run fence).
 *
 * A device publishes its chat ref as a run starts and while it runs, so every other device that has synced sees the
 * run before it settles. Each segment is folded on its own through the ledger, never into this device's ledger: the
 * epochs and run bookkeeping of two devices do not order against each other (XD1).
 */

/** An unsettled run another device's segment holds. @public */
export type ForeignRun = Readonly<{
  /** The segment it was read from: the device that runs it. */
  deviceId: string;
  runId: string;
  /** Where its device's own ledger says it is; `paused` waits for that device's person. */
  state: Extract<RunLifecycleState, 'admitted' | 'running' | 'paused'>;
  /**
   * The newest `recordedAt` among the run's rows, in epoch milliseconds, on the clock of the device that runs it. Shown
   * to the person; never read for staleness, which reads {@link ForeignRun.observedAt}.
   */
  lastRecordedAt: number;
  /** The key of the run's newest row. */
  tip: RowKey;
  /**
   * When the run's rows last changed on this device, on this device's clock: its segment's modification time here,
   * else when this reader first read the run's newest row. No other device's clock, fast, slow or corrupt, decides
   * it, and every reader on this device reads the same time for it.
   */
  observedAt: number;
  /**
   * How long this device's pulls of the remote found the run's segment exactly as this reader holds it, in milliseconds
   * (`pulledQuietOf` over `chatPulledAtFileName` beside the segments, written by sync; round 19). `undefined` when no
   * pull found these bytes. The run is abandoned only on this quiet, never on this device's clock.
   */
  pulledQuiet?: number | undefined;
  /** The person's message the run holds: its committed turn, else the message it was admitted with. */
  words?: UserProviderMessage | undefined;
  /**
   * Another device found the run abandoned and went on: its segment says the run's turn (`abandonedTurnOf`). The run
   * then holds the chat nowhere, though its own rows stay out of the history until its device settles it.
   */
  takenOver?: true | undefined;
}>;

/**
 * How long a foreign run may go without a new row before it no longer holds the chat: ten minutes, observed (XD3).
 *
 * Liveness never waits on content. The device that holds a run appends a `run.heartbeat` row once a minute while the
 * run is admitted, running, or paused and held by an open session there (`runHeartbeatMilliseconds` in the Tau agent
 * host), and asks its placement to record the chats after each one, so a long tool call or a paused run that writes
 * nothing still moves the run's newest row and the chat's ref. Ten heartbeats fit in the bound: sync can drop several
 * and a live run still holds. Past it the device is gone, offline or partitioned: the run is abandoned for the fence,
 * so a dead device cannot lock a chat, and the device that goes on appends the person's turn the run holds
 * (`abandonedTurnOf`).
 *
 * Quiet is evidenced, never inferred (rounds 18 and 19): only pulls of the remote that kept finding the run's segment
 * as it was show the remote held nothing newer all that while ({@link ForeignRun.pulledQuiet}). This device's clock
 * alone, or a segment's age, shows nothing: a device that slept or was closed for hours holds an old copy of a run
 * another device kept writing, until it pulls. Nor is quiet ever one reading of this device's clock against another,
 * either of which can jump: sync adds up the gaps between pulls that found the same bytes, each counted at most two
 * minutes and a gap the clock ran backwards across counted as nothing, so a backward jump only shortens the quiet and
 * a forward jump adds at most two minutes (`notePull` in ChatLedger.lean, T11). No other device's clock decides it, and
 * the page and the agent host read it from the same files. A run quiet here past {@link foreignRunAskPullMilliseconds}
 * that no pulls have shown abandoned awaits them ({@link foreignRunStanding}), and its reader asks for them.
 *
 * @public
 */
export const foreignRunStaleMilliseconds = 10 * 60 * 1000;

/**
 * How long a foreign run may go without a new row here before its reader asks for pulls of the remote: two heartbeat
 * intervals (round 19). Only pulls evidence quiet ({@link ForeignRun.pulledQuiet}), so they are asked for well before
 * the staleness bound, and a dead device's run is freed about one bound after its reader starts asking.
 *
 * @public
 */
export const foreignRunAskPullMilliseconds = 2 * 60 * 1000;

/**
 * When this module instance first saw each foreign run's newest row, by device, run and row key: the fallback for a
 * segment read with no modification time ({@link ParsedLogSegment.receivedAt}). Bounded; the sightings read least
 * recently go first, so a run still being read keeps its time.
 */
const sightings = new Map<string, number>();
const sightingsLimit = 4096;

/*
 * When this device saw a run change (round 17). A segment's modification time on this device is when its newest rows
 * arrived here, as this device's clock stamped the write: sync writes a segment only when its bytes change, so every
 * reader on the device (the page, the agent host's worker) reads the same time for it, however late each first reads
 * it. A run's rows are the segment's, so the run changed no later than that. Only a segment with no modification time
 * falls back to when this module instance first saw the run's newest row.
 */
const sighted = (
  run: Omit<ForeignRun, 'observedAt' | 'pulledQuiet' | 'takenOver'>,
  receivedAt: number | undefined,
  now: number,
): number => {
  if (receivedAt !== undefined) {
    return receivedAt;
  }
  const key = JSON.stringify([run.deviceId, run.runId, run.tip.leaderEpoch, run.tip.sequence]);
  const seen = sightings.get(key) ?? now;
  sightings.delete(key);
  sightings.set(key, seen);
  if (sightings.size > sightingsLimit) {
    sightings.delete(sightings.keys().next().value!);
  }
  return seen;
};

const unsettledStates: ReadonlySet<RunLifecycleState> = new Set(['admitted', 'running', 'paused']);

const timeOf = (event: AgentLogEvent): number => {
  const parsed = Date.parse(event.recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** One device's segment folded for its runs: its ledger, and each run's newest time and last row as its rows went by. */
type RunFold = Readonly<{
  ledger: ChatLedger;
  seen: ReadonlyMap<string, RunSeen>;
  runs: ReadonlyArray<Omit<ForeignRun, 'observedAt' | 'pulledQuiet' | 'takenOver'>>;
  /** The runs whose person's turn this segment says as abandoned. */
  saidAbandoned: ReadonlySet<string>;
}>;

type RunSeen = Readonly<{ lastRecordedAt: number; tip: AgentLogEvent; words?: UserProviderMessage | undefined }>;

/** The person's message a row says for its run, when it says one: an admission's, a committed turn's or an external turn's. */
const wordsOf = (event: AgentLogEvent): UserProviderMessage | undefined => {
  if (event.type === 'run.lifecycle' && event.state === 'admitted') {
    const { admission } = event as { readonly admission?: { readonly message?: unknown } };
    const message = admission?.message as { readonly role?: unknown; readonly id?: unknown } | undefined;
    return message?.role === 'user' && typeof message.id === 'string' ? (message as UserProviderMessage) : undefined;
  }
  if (event.type === 'turn.history-projection-committed') {
    return event.message;
  }
  return event.type === 'message.appended' &&
    event.message.role === 'user' &&
    event.message.metadata?.tauInternal?.['kind'] === 'external-agent'
    ? event.message
    : undefined;
};

/** The words a row says for its run, given what it said before: an envelope replaced on them names the session. */
const wordsAfter = (event: AgentLogEvent, known: UserProviderMessage | undefined): UserProviderMessage | undefined =>
  event.type === 'message.envelope-replaced' && event.messageId === known?.id && event.replacement.role === 'user'
    ? event.replacement
    : (wordsOf(event) ?? known);

/**
 * Fold rows onto a segment's runs, from where an earlier fold of its first rows left off (or from nothing): every run
 * the rows name keeps its newest time and its last row, and the runs whose lifecycle the ledger leaves unsettled are
 * answered, in the order their rows first appear.
 */
const foldRuns = (deviceId: string, prior: RunFold | undefined, rows: readonly AgentLogEvent[]): RunFold => {
  const ledger = foldChatLedger(prior?.ledger ?? emptyChatLedger, rows);
  const seen = new Map(prior?.seen);
  const saidAbandoned = new Set(prior?.saidAbandoned);
  for (const event of rows) {
    if (event.type === 'message.appended' && isAbandonedTurn(event.message)) {
      saidAbandoned.add(event.runId);
    }
    const at = timeOf(event);
    const known = seen.get(event.runId);
    const words = wordsAfter(event, known?.words);
    seen.set(event.runId, {
      lastRecordedAt: known === undefined ? at : Math.max(known.lastRecordedAt, at),
      tip: event,
      ...(words === undefined ? {} : { words }),
    });
  }
  const runs = [...seen].flatMap(
    ([runId, { lastRecordedAt, tip, words }]): Array<Omit<ForeignRun, 'observedAt' | 'pulledQuiet' | 'takenOver'>> => {
      const lifecycle = ledger.runs[runId]?.lifecycle;
      return lifecycle === undefined || !unsettledStates.has(lifecycle)
        ? []
        : [
            {
              deviceId,
              runId,
              state: lifecycle as ForeignRun['state'],
              lastRecordedAt,
              tip: { leaderEpoch: tip.leaderEpoch, sequence: tip.sequence },
              ...(words === undefined ? {} : { words }),
            },
          ];
    },
  );
  return { ledger, seen, runs, saidAbandoned };
};

/**
 * {@link unsettledForeignRuns} over segments already parsed (`parseLogSegments`), for a reader that holds them.
 *
 * @param segments - Other devices' parsed segments.
 * @param now - This device's time, in epoch milliseconds: when a run whose newest row is new here is seen, for a
 *   segment read with no modification time.
 * @returns Every unsettled run, segment by segment.
 * @public
 */
export const unsettledParsedRuns = (
  segments: readonly ParsedLogSegment[],
  now: number = Date.now(),
): readonly ForeignRun[] => {
  const folds = segments.map((segment) => runFoldOf(segment));
  const saidAbandoned = new Set(folds.flatMap((fold) => [...fold.saidAbandoned]));
  return folds.flatMap((fold, index) =>
    fold.runs.map((run) => {
      const { receivedAt, pulledQuiet } = segments[index]!;
      const observedAt = sighted(run, receivedAt, now);
      const takenOver = saidAbandoned.has(run.runId);
      const prior = observed.get(run);
      if (
        prior?.observedAt === observedAt &&
        prior.pulledQuiet === pulledQuiet &&
        (prior.takenOver === true) === takenOver
      ) {
        return prior;
      }
      const next: ForeignRun = {
        ...run,
        observedAt,
        ...(pulledQuiet === undefined ? {} : { pulledQuiet }),
        ...(takenOver ? { takenOver: true } : {}),
      };
      observed.set(run, next);
      return next;
    }),
  );
};

/* Each folded run as last answered, so a refold that sees nothing new answers the very same run. */
const observed = new WeakMap<Omit<ForeignRun, 'observedAt' | 'pulledQuiet' | 'takenOver'>, ForeignRun>();

/*
 * A segment's run fold, by its parsed rows and device: a refold reads every segment again, and one whose rows are the
 * same array (every reader keeps a parsed segment's rows while its bytes do not change) is not folded again; one whose
 * rows grew from an array already folded (`noteGrownRows`) folds just the rows it gained.
 */
const runFolds = new WeakMap<readonly AgentLogEvent[], Map<string, RunFold>>();
/*
 * Round 22: what a grown array carries on from, the folds of the rows it grew from and how many rows those were, never
 * those rows themselves. A fold holds no array of rows, so a segment a heartbeat grows every minute keeps one earlier
 * fold, not every earlier copy of its rows.
 */
const grownFrom = new WeakMap<readonly AgentLogEvent[], Readonly<{ length: number; folds: Map<string, RunFold> }>>();

/** A segment's folds by device, which the folds of its rows grown later carry on from. */
const foldsOf = (events: readonly AgentLogEvent[]): Map<string, RunFold> => {
  let byDevice = runFolds.get(events);
  if (byDevice === undefined) {
    byDevice = new Map();
    runFolds.set(events, byDevice);
  }
  return byDevice;
};

/**
 * Say that `grown` is `prior`'s rows with more appended after them, so a run fold of `prior` is carried on, not redone.
 * Only `prior`'s folds are kept for it, never `prior` itself.
 *
 * @param grown - The longer rows.
 * @param prior - The rows they begin with.
 * @internal
 */
export const noteGrownRows = (grown: readonly AgentLogEvent[], prior: readonly AgentLogEvent[]): void => {
  grownFrom.set(grown, { length: prior.length, folds: foldsOf(prior) });
};

/** One device's segment as last parsed: its bytes, its rows, and how many of its bytes those rows came from. @public */
export type SegmentParse = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  events: readonly AgentLogEvent[];
  validByteLength: number;
}>;

/** Whether `next` is `prior`'s parsed bytes with more appended after them. */
const grewFrom = (prior: Uint8Array<ArrayBuffer>, validByteLength: number, next: Uint8Array<ArrayBuffer>): boolean => {
  if (next.byteLength <= prior.byteLength || validByteLength === 0) {
    return false;
  }
  for (let index = 0; index < validByteLength; index++) {
    if (prior[index] !== next[index]) {
      return false;
    }
  }
  return true;
};

/**
 * Parse one device's segment on from its last parse (XD1, XD3): the same bytes give the same parse; bytes that only
 * grew (a row, a heartbeat) parse just their new lines, keep the rows already parsed, and let a run fold of those rows
 * carry on ({@link noteGrownRows}); anything else parses whole. Every reader of segments (the agent host's appender,
 * the page's projection) parses through this.
 *
 * @param prior - The segment's last parse, if any.
 * @param bytes - Its bytes now.
 * @returns Its parse now.
 * @public
 */
export const parseSegmentFrom = (prior: SegmentParse | undefined, bytes: Uint8Array<ArrayBuffer>): SegmentParse => {
  if (prior?.bytes === bytes) {
    return prior;
  }
  if (prior !== undefined && grewFrom(prior.bytes, prior.validByteLength, bytes)) {
    const tail = parseEventLogBytes(bytes.slice(prior.validByteLength));
    const events = tail.events.length === 0 ? prior.events : [...prior.events, ...tail.events];
    if (events !== prior.events) {
      noteGrownRows(events, prior.events);
    }
    return { bytes, events, validByteLength: prior.validByteLength + tail.validByteLength };
  }
  const whole = parseEventLogBytes(bytes);
  return { bytes, events: whole.events, validByteLength: whole.validByteLength };
};

const runFoldOf = (segment: ParsedLogSegment): RunFold => {
  const byDevice = foldsOf(segment.events);
  let fold = byDevice.get(segment.deviceId);
  if (fold === undefined) {
    const prior = grownFrom.get(segment.events);
    const carried = prior?.folds.get(segment.deviceId);
    fold =
      carried === undefined || prior === undefined
        ? foldRuns(segment.deviceId, undefined, segment.events)
        : foldRuns(segment.deviceId, carried, segment.events.slice(prior.length));
    byDevice.set(segment.deviceId, fold);
  }
  return fold;
};

/**
 * The unsettled runs other devices' segments hold: each segment folded on its own ledger, never merged (XD3).
 *
 * @param segments - Other devices' segments, never this device's own.
 * @param now - This device's time, in epoch milliseconds: when a run whose newest row is new here is seen.
 * @returns Every unsettled run, segment by segment.
 * @public
 *
 * @example <caption>Whether another device is running a chat now</caption>
 * ```typescript
 * import { liveForeignRun, unsettledForeignRuns } from '@taucad/agent-host';
 * import type { ChatLogSegment } from '@taucad/agent-host';
 *
 * declare const segments: readonly ChatLogSegment[];
 *
 * const elsewhere = liveForeignRun(unsettledForeignRuns(segments), Date.now());
 * ```
 */
export const unsettledForeignRuns = (
  segments: readonly ChatLogSegment[],
  now: number = Date.now(),
): readonly ForeignRun[] => unsettledParsedRuns(parseLogSegments(segments), now);

/**
 * Whether a foreign run no longer holds the chat: pulls of the remote found its segment as this reader holds it for
 * more than {@link foreignRunStaleMilliseconds}, or another device already found it abandoned and went on
 * ({@link ForeignRun.takenOver}).
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound; {@link foreignRunStaleMilliseconds} by default.
 * @returns `true` when the run is treated as abandoned.
 * @public
 */
export const isAbandonedForeignRun = (
  run: Pick<ForeignRun, 'observedAt' | 'pulledQuiet' | 'takenOver'>,
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): boolean => foreignRunStanding(run, now, { bound }).abandoned;

/** Where a foreign run stands at a moment ({@link foreignRunStanding}). @public */
export type ForeignRunStanding = Readonly<{
  /** The run no longer holds the chat. */
  abandoned: boolean;
  /**
   * The run has been quiet here past {@link foreignRunAskPullMilliseconds}, or its segment changed later than this
   * device's clock now reads (the clock went back), and no pulls have shown it abandoned: it still holds the chat, and
   * only pulls can change that, so its reader asks for them.
   */
  awaitsPull: boolean;
  /** When the answer next changes with this device's clock alone; `undefined`: only a pull or a new row changes it. */
  changesAt: number | undefined;
}>;

/**
 * Where a foreign run stands at `now` (`standing` in ChatLedger.lean, T11): the one decision the fence and the page both
 * read, so they never disagree about a run. The run is abandoned once pulls found its segment unchanged for more than
 * the bound ({@link ForeignRun.pulledQuiet}); this device's clock decides only when pulls are asked for. Short of
 * that, it holds the chat; once it has been quiet here past `ask`, or the clock reads earlier than its segment last
 * changed, it awaits pulls.
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param limits - The staleness bound, and how long it may be quiet here before pulls are asked for.
 * @returns Whether it is abandoned or awaits pulls now, and when that changes with no pull and no new row.
 * @public
 */
export const foreignRunStanding = (
  run: Pick<ForeignRun, 'observedAt' | 'pulledQuiet' | 'takenOver'>,
  now: number,
  {
    bound = foreignRunStaleMilliseconds,
    ask = foreignRunAskPullMilliseconds,
  }: Readonly<{ bound?: number; ask?: number }> = {},
): ForeignRunStanding => {
  if (run.takenOver === true || (run.pulledQuiet ?? 0) > bound) {
    return { abandoned: true, awaitsPull: false, changesAt: undefined };
  }
  const asksAfter = run.observedAt + ask;
  return now > asksAfter || now < run.observedAt
    ? { abandoned: false, awaitsPull: true, changesAt: undefined }
    : { abandoned: false, awaitsPull: false, changesAt: asksAfter + 1 };
};

/**
 * The foreign run that holds the chat now, if any: the most recently changed unsettled run that is not abandoned.
 *
 * @param runs - Unsettled foreign runs.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound.
 * @returns The run, or `undefined` when no other device holds the chat.
 * @public
 */
export const liveForeignRun = (
  runs: readonly ForeignRun[],
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): ForeignRun | undefined =>
  runs
    .filter((run) => !isAbandonedForeignRun(run, now, bound))
    .toSorted((left, right) => right.observedAt - left.observedAt)[0];
