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
   * else when this reader first read the run's newest row. Staleness is measured from it alone, so no other device's
   * clock, fast, slow or corrupt, decides it, and every reader on this device reads the same time for it.
   */
  observedAt: number;
  /** The person's message the run holds: its committed turn, else the message it was admitted with. */
  words?: UserProviderMessage | undefined;
  /**
   * Another device found the run abandoned and went on: its segment says the run's turn (`abandonedTurnOf`). The run
   * then holds the chat nowhere, though its own rows stay out of the history until its device settles it.
   */
  takenOver?: true | undefined;
}>;

/**
 * How long a foreign run may go without a new row before it no longer holds the chat: ten minutes of this device's
 * time since it last saw the run's rows change.
 *
 * Liveness never waits on content. The device that holds a run appends a `run.heartbeat` row once a minute while the
 * run is admitted, running, or paused and held by an open session there (`runHeartbeatMilliseconds` in the Tau agent
 * host), and asks its placement to record the chats after each one, so a long tool call or a paused run that writes
 * nothing still moves the run's newest row and the chat's ref. Ten heartbeats fit in the bound: sync can drop several
 * and a live run still holds. Past it the device is gone, offline or partitioned: the run is abandoned for the fence,
 * so a dead device cannot lock a chat, and the device that goes on appends the person's turn the run holds
 * (`abandonedTurnOf`). The bound is read on this device's clock from when it saw the run change, never from the
 * run's `recordedAt`: a device whose clock is wrong can neither hold a chat forever nor let one go early. "Saw it
 * change" is when the run's segment last changed on this device (its modification time), so the page and the agent
 * host agree; only a segment read with no modification time waits the bound out once from first sight.
 *
 * @public
 */
export const foreignRunStaleMilliseconds = 10 * 60 * 1000;

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
  run: Omit<ForeignRun, 'observedAt' | 'takenOver'>,
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
  runs: ReadonlyArray<Omit<ForeignRun, 'observedAt' | 'takenOver'>>;
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
    const words = wordsOf(event) ?? known?.words;
    seen.set(event.runId, {
      lastRecordedAt: known === undefined ? at : Math.max(known.lastRecordedAt, at),
      tip: event,
      ...(words === undefined ? {} : { words }),
    });
  }
  const runs = [...seen].flatMap(
    ([runId, { lastRecordedAt, tip, words }]): Array<Omit<ForeignRun, 'observedAt' | 'takenOver'>> => {
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
      const observedAt = sighted(run, segments[index]!.receivedAt, now);
      const takenOver = saidAbandoned.has(run.runId);
      const prior = observed.get(run);
      if (prior?.observedAt === observedAt && (prior.takenOver === true) === takenOver) {
        return prior;
      }
      const next: ForeignRun = { ...run, observedAt, ...(takenOver ? { takenOver: true } : {}) };
      observed.set(run, next);
      return next;
    }),
  );
};

/* Each folded run as last answered, so a refold that sees nothing new answers the very same run. */
const observed = new WeakMap<Omit<ForeignRun, 'observedAt' | 'takenOver'>, ForeignRun>();

/*
 * A segment's run fold, by its parsed rows and device: a refold reads every segment again, and one whose rows are the
 * same array (every reader keeps a parsed segment's rows while its bytes do not change) is not folded again; one whose
 * rows grew from an array already folded (`noteGrownRows`) folds just the rows it gained.
 */
const runFolds = new WeakMap<readonly AgentLogEvent[], Map<string, RunFold>>();
const grownFrom = new WeakMap<readonly AgentLogEvent[], readonly AgentLogEvent[]>();

/**
 * Say that `grown` is `prior`'s rows with more appended after them, so a run fold of `prior` is carried on, not redone.
 *
 * @param grown - The longer rows.
 * @param prior - The rows they begin with.
 * @internal
 */
export const noteGrownRows = (grown: readonly AgentLogEvent[], prior: readonly AgentLogEvent[]): void => {
  grownFrom.set(grown, prior);
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
  let byDevice = runFolds.get(segment.events);
  if (byDevice === undefined) {
    byDevice = new Map();
    runFolds.set(segment.events, byDevice);
  }
  let fold = byDevice.get(segment.deviceId);
  if (fold === undefined) {
    const prior = grownFrom.get(segment.events);
    const carried = prior === undefined ? undefined : runFolds.get(prior)?.get(segment.deviceId);
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
 * Whether a foreign run no longer holds the chat: this device has not seen its rows change for more than
 * {@link foreignRunStaleMilliseconds}, on its own clock, or another device already found it abandoned and went on
 * ({@link ForeignRun.takenOver}).
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound; {@link foreignRunStaleMilliseconds} by default.
 * @returns `true` when the run is treated as abandoned.
 * @public
 */
export const isAbandonedForeignRun = (
  run: Pick<ForeignRun, 'observedAt' | 'takenOver'>,
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): boolean => foreignRunStanding(run, now, bound).abandoned;

/**
 * Where a foreign run stands at `now` under {@link isAbandonedForeignRun}'s rule, and when that answer next changes
 * with no new row: the one decision the fence and the page both read, so they never disagree about a run. Both times
 * are this device's: a run is abandoned once the bound has passed since this device saw it change, and stays so until
 * a newer row arrives.
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound.
 * @returns Whether it is abandoned now, and when that changes with no new row (`undefined`: never).
 * @public
 */
export const foreignRunStanding = (
  run: Pick<ForeignRun, 'observedAt' | 'takenOver'>,
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): Readonly<{ abandoned: boolean; changesAt: number | undefined }> =>
  run.takenOver !== true && now - run.observedAt <= bound
    ? { abandoned: false, changesAt: run.observedAt + bound + 1 }
    : { abandoned: true, changesAt: undefined };

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
