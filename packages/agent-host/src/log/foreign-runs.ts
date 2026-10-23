import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { AgentLogEvent, RowKey, RunLifecycleState } from '#log/event-types.js';
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
  /** The newest `recordedAt` among the run's rows, in epoch milliseconds, on the clock of the device that runs it. */
  lastRecordedAt: number;
  /** The key of the run's newest row. */
  tip: RowKey;
}>;

/**
 * How long a foreign run may go without a new row before it no longer holds the chat: ten minutes.
 *
 * Liveness never waits on content. The device that holds a run appends a `run.heartbeat` row once a minute while the
 * run is admitted, running, or paused and held by an open session there (`runHeartbeatMilliseconds` in the Tau agent
 * host), and asks its placement to record the chats after each one, so a long tool call or a paused run that writes
 * nothing still moves the run's newest `recordedAt` and the chat's ref. Ten heartbeats fit in the bound: sync can drop
 * several and a live run still holds. Past it the device is gone, offline or partitioned: the run is abandoned for the
 * fence, so a dead device cannot lock a chat, and the user's turn it holds joins the history without its partial
 * output (see `createEventLogAppender`).
 *
 * @public
 */
export const foreignRunStaleMilliseconds = 10 * 60 * 1000;

const unsettledStates: ReadonlySet<RunLifecycleState> = new Set(['admitted', 'running', 'paused']);

const timeOf = (event: AgentLogEvent): number => {
  const parsed = Date.parse(event.recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** One device's segment folded for its runs: its ledger, and each run's newest time and last row as its rows went by. */
type RunFold = Readonly<{
  ledger: ChatLedger;
  seen: ReadonlyMap<string, Readonly<{ lastRecordedAt: number; tip: AgentLogEvent }>>;
  runs: readonly ForeignRun[];
}>;

/**
 * Fold rows onto a segment's runs, from where an earlier fold of its first rows left off (or from nothing): every run
 * the rows name keeps its newest time and its last row, and the runs whose lifecycle the ledger leaves unsettled are
 * answered, in the order their rows first appear.
 */
const foldRuns = (deviceId: string, prior: RunFold | undefined, rows: readonly AgentLogEvent[]): RunFold => {
  const ledger = foldChatLedger(prior?.ledger ?? emptyChatLedger, rows);
  const seen = new Map(prior?.seen);
  for (const event of rows) {
    const at = timeOf(event);
    const known = seen.get(event.runId);
    seen.set(event.runId, {
      lastRecordedAt: known === undefined ? at : Math.max(known.lastRecordedAt, at),
      tip: event,
    });
  }
  const runs = [...seen].flatMap(([runId, { lastRecordedAt, tip }]): ForeignRun[] => {
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
          },
        ];
  });
  return { ledger, seen, runs };
};

/**
 * {@link unsettledForeignRuns} over segments already parsed (`parseLogSegments`), for a reader that holds them.
 *
 * @param segments - Other devices' parsed segments.
 * @returns Every unsettled run, segment by segment.
 * @public
 */
export const unsettledParsedRuns = (segments: readonly ParsedLogSegment[]): readonly ForeignRun[] =>
  segments.flatMap((segment) => runFoldOf(segment).runs);

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
export const unsettledForeignRuns = (segments: readonly ChatLogSegment[]): readonly ForeignRun[] =>
  unsettledParsedRuns(parseLogSegments(segments));

/**
 * Whether a foreign run no longer holds the chat: its newest row is more than {@link foreignRunStaleMilliseconds} old,
 * or more than that far in this device's future.
 *
 * The age is read off two clocks. A device whose clock is behind looks older by its skew, so the bound is wide enough
 * that a skew of minutes still leaves a live run held. A device whose clock is ahead looks younger by its skew; one
 * more than the bound ahead names no time this device can wait out, so its run is not allowed to hold the chat: two
 * runs then fall back to each device's own history, as before the fence existed, rather than locking the chat for as
 * long as the other clock is wrong.
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound; {@link foreignRunStaleMilliseconds} by default.
 * @returns `true` when the run is treated as abandoned.
 * @public
 */
export const isAbandonedForeignRun = (
  run: Pick<ForeignRun, 'lastRecordedAt'>,
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): boolean => foreignRunStanding(run, now, bound).abandoned;

/**
 * Where a foreign run stands at `now` under {@link isAbandonedForeignRun}'s rule, and when that answer next changes:
 * the one decision the fence and the history both read, so they never disagree about a run. A run more than the bound
 * in this device's future is abandoned until its clock comes within the bound (`changesAt`), then live; a live run is
 * abandoned once it is the bound old; one that old stays abandoned until a newer row arrives.
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound.
 * @returns Whether it is abandoned now, and when that changes with no new row (`undefined`: never).
 * @public
 */
export const foreignRunStanding = (
  run: Pick<ForeignRun, 'lastRecordedAt'>,
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): Readonly<{ abandoned: boolean; changesAt: number | undefined }> => {
  if (now < run.lastRecordedAt - bound) {
    return { abandoned: true, changesAt: run.lastRecordedAt - bound };
  }
  if (now - run.lastRecordedAt <= bound) {
    return { abandoned: false, changesAt: run.lastRecordedAt + bound + 1 };
  }
  return { abandoned: true, changesAt: undefined };
};

/**
 * The foreign run that holds the chat now, if any: the newest unsettled run that is not abandoned.
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
    .toSorted((left, right) => right.lastRecordedAt - left.lastRecordedAt)[0];
