/**
 * `recordSync`: one record file kept in step with the person's edits and with every other writer of that file
 * (graphics event-driven state charter D1, D2, D3, D6, D7, D8; invariants I5, I10, I12).
 *
 * The protocol is `apps/ui/specs/record-sync/RecordSync.tla`, and its README's target rules 1 to 7 are what this
 * machine implements:
 *
 * 1. every checked write adds an entry to `ownWrites` when it is issued; entries belong to writes, and a conflict
 *    removes only its own write's entry, while a lost reply keeps it;
 * 2. a read is attributed `own` when its bytes match an entry in any state;
 * 3. a completed read drops every acknowledged entry whose bytes differ from the bytes it read, and never an entry
 *    whose reply is pending or lost;
 * 4. an acknowledged write drops the earlier acknowledged entries;
 * 5. a read overlaps a write when it starts or completes while the write is in flight; the reply of a write no read
 *    overlapped publishes it as `own` and supersedes any read in flight, and the reply of an overlapped write
 *    publishes nothing and starts a refresh read, which the map attributes;
 * 6. after a conflict or an overlapped reply the writer waits for the latest read;
 * 7. the close fence stops new writes.
 *
 * Own-write identity is the written bytes themselves, compared exactly. That is the spec's digest ("a digest is its
 * bytes"): it has no collision, and it needs no hashing step between issuing a write and recording its entry.
 * Attribution never reads a clock (I5). The entry of a write whose reply was lost has no time to live; the only thing
 * that ends it is {@link maxLostWrites}, a bound on how many are kept.
 *
 * Three parallel regions:
 *
 * - `source`: the reads. Only the latest read reaches the store; a failed read backs off on the injected clock.
 * - `intent`: the edit debounce. Edits coalesce into one pending patch until the quiet window ends or a flush.
 * - `write`: one checked write at a time, flush, ensure and reset included.
 *
 * Context holds the published snapshot (`published`, `origin`, `patch`, `health`), which is the record's bytes and
 * the record parsed from them, so it is rebuilt by the next read of the file. Ports (the file reads and the checked
 * write) are the two actors a composition root provides; nothing here holds a function, a promise or a timer.
 *
 * The spec's `EagerWriter` is this machine's writer: after a lost reply it reads the file back before it writes again
 * (`Resolve`), and it issues its next write, or finds nothing left to write (`Forget`), in the macrostep of the
 * conflict read or read-back it waited for. A refusal, `ensure`, `reset` and the health report take no part in
 * attribution and are not modelled.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { createAsyncLogic, matchesState, setup, types } from 'xstate';
import type { StateValue } from 'xstate';
import { eventSchemas } from '#lib/xstate.lib.js';
import { maxReadAttempts, slowWriteMilliseconds } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { sameBytes } from '#workbench-records/record-sync-policy.js';
import type { RecordBytes, RecordPolicy, RecordRefusal } from '#workbench-records/record-sync-policy.js';

/** Checked writes one edit may issue before it reports that the record keeps changing under it. */
export const maxWriteAttempts = 3;

/**
 * How many lost-reply entries are kept. A lost write may land at any later time, so its entry is never dropped by a
 * read or an acknowledgement (target rule 3); this bound only stops the list growing over a long session. Past it the
 * oldest lost entry goes, which the model does not cover: that write, landing later still, would read as foreign.
 */
export const maxLostWrites = 8;

/** The first retry delay after a failed write or read, in milliseconds; it doubles up to {@link maxRetryDelay}. */
export const firstRetryDelay = 250;

/** The longest retry delay, in milliseconds. */
export const maxRetryDelay = 8000;

/** The `RecordSync.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. */
export type RecordSyncAction =
  | 'Edit'
  | 'IssueWrite'
  | 'ReplyApplied'
  | 'ReplyConflict'
  | 'LoseReply'
  | 'WatchRead'
  | 'ForcedRead'
  | 'CompleteRead'
  | 'CloseFence'
  | 'Unmodelled';

/** What the store shows: the record, the exact bytes it was read from, and why those bytes are not used, if so. */
export type RecordSnapshot<T> = Readonly<{
  record: T | undefined;
  bytes: RecordBytes | null;
  refusal: RecordRefusal | undefined;
}>;

/** One checked write this store issued, kept so a read of its bytes is attributed to this store. */
export type OwnWrite<P> = Readonly<{
  writeId: number;
  bytes: RecordBytes;
  /** The person's fields this write carried; `undefined` for a reset. */
  patch: P | undefined;
  state: 'inFlight' | 'acknowledged' | 'lost';
}>;

type Cycle<T, P> = Readonly<{
  kind: 'edit' | 'ensure' | 'reset';
  /** What started it: an edit, a flush or command, or the retry timer. */
  trigger: 'edit' | 'request' | 'timer';
  /** The record the person asked for; its fields fill what the file lacks. */
  next: T | undefined;
  /** The fields to carry onto the file's record; `undefined` owes nothing. */
  patch: P | undefined;
  /** Reset only: the refused bytes the person reviewed. */
  reviewed: RecordBytes | null;
  requests: readonly string[];
  /** Checked writes this cycle has issued. */
  attempt: number;
  /** A flush was waiting when the cycle began, so its outcome is the flush's answer. */
  flushed: boolean;
  /** Reset only: what was deferred when it formed, which a saved reset replaces and any other outcome still owes. */
  replaces?: P;
}>;

type Command<T> =
  | Readonly<{ kind: 'ensure'; requestId: string; next: T }>
  | Readonly<{ kind: 'reset'; requestId: string; next: T; reviewed: RecordBytes | null }>;

/** State owned by one `recordSync` actor. */
export type RecordSyncContext<T, P> = Readonly<{
  /** Milliseconds an edit waits for a later one before it is written; 0 writes at once. */
  editDebounce: number;
  published: RecordSnapshot<T>;
  /** Who wrote the published bytes; `none` before the first read. */
  origin: 'none' | 'own' | 'foreign';
  /** The person's fields in the published bytes when they are this store's own write. */
  patch: P | undefined;
  health: RecordHealth;
  ownWrites: ReadonlyArray<OwnWrite<P>>;
  nextWriteId: number;
  /** A read started or completed while the latest write was in flight (target rule 5). */
  overlap: boolean;
  /** Requests answered when the latest read settles. */
  readRequests: readonly string[];
  /** The latest read publishes even when its bytes are the ones already shown (*Try again*). */
  readForced: boolean;
  readFailures: number;
  /** A reply was lost: the file is read back before the next write. `reading` once such a read has started. */
  readBack: 'none' | 'owed' | 'reading';
  /** The record the person last asked for, or the last foreign record while nothing is owed: the base of a diff. */
  intended: T | undefined;
  /** Edits no write has taken yet; `since` numbers the first of them. */
  pending: Readonly<{ next: T; patch: P; requests: readonly string[]; since: number }> | undefined;
  /** How many edits the store has taken. */
  edits: number;
  /** The edits the latest flush waits for: those numbered up to this. */
  flushedUpTo: number;
  /** Fields a failed or refused write still owes the file. */
  deferred: P | undefined;
  commands: ReadonlyArray<Command<T>>;
  /** Flush requests waiting for the writer. */
  flushes: readonly string[];
  cycle: Cycle<T, P> | undefined;
  /** The checked write on the wire. */
  inFlight: Readonly<{ writeId: number; data: string; expected: RecordBytes | null; requestId: string }> | undefined;
  /** Milliseconds before the next timed retry of a failed write. */
  retryDelay: number;
  /** The write on the wire has been outstanding past {@link slowWriteMilliseconds}. */
  slow: boolean;
  /** A write failed and its change is still owed. */
  writeFailed: boolean;
  /** The deferred patch waits for the retry timer, so a command served meanwhile leaves the timer due. */
  retryOwed: boolean;
  closeFenced: boolean;
  /** An effect or child failure no transition modelled; the store answers `false` from then on (MC-R12). */
  fault: string | undefined;
  /** How many faults the store has recorded, so a request whose own step faulted can be answered. */
  faults: number;
}>;

/** Input of a `recordSync` actor. */
export type RecordSyncInput = Readonly<{ editDebounce?: number }>;

/**
 * Events a `recordSync` actor takes. The first eight are its public alphabet; the composition root sends them
 * through typed commands. The `source.*` and `write.*` events are raised by one region for another.
 */
export type RecordSyncEvent<T> =
  /** A change event or the first read: read the file. `forced` publishes unchanged bytes too. */
  | { type: 'read'; requestId: string; forced: boolean }
  /** The person's *Try again* after reads stopped: a fresh set of attempts, forced. */
  | { type: 'retryRead'; requestId: string }
  /** The source changed: the read in flight must not publish. */
  | { type: 'invalidate' }
  | { type: 'edit'; requestId: string; next: T }
  /** Write `seed` only while the file is absent. */
  | { type: 'ensure'; requestId: string; seed: T }
  /** Replace a refused record; `reviewed` is the exact refused bytes the person saw. */
  | { type: 'reset'; requestId: string; next: T; reviewed: RecordBytes | null }
  /** Write everything owed now; answered `true` once nothing is owed. */
  | { type: 'flush'; requestId: string }
  | { type: 'close' }
  | { type: 'write.readRequested' }
  | { type: 'write.published' }
  | { type: 'source.completed' }
  | { type: 'source.failed' }
  | { type: 'source.abandoned' };

/** Events a `recordSync` actor emits to its subscribers. */
export type RecordSyncEmitted<T, P> =
  /** A new snapshot: the record with its attribution, one value (D2). */
  | { type: 'published'; snapshot: RecordSnapshot<T>; origin: 'own' | 'foreign'; patch: P | undefined }
  /** The answer to the requests that carried these ids. */
  | { type: 'answered'; requestIds: readonly string[]; ok: boolean }
  /** A read or write failed; the health report carries what a person needs. */
  | { type: 'failed'; error: unknown }
  | { type: 'healthChanged'; health: RecordHealth };

/** What the checked-write port answers. */
export type CheckedWriteOutcome =
  | Readonly<{ status: 'applied'; content: RecordBytes }>
  | Readonly<{ status: 'conflict' }>
  /** An `ensure` whose owner no longer wants the file. */
  | Readonly<{ status: 'ineligible' }>
  /** The call failed. `lost` when the write may still have been applied: its reply or connection was lost. */
  | Readonly<{ status: 'failed'; error: unknown; lost: boolean }>;

/** What the read port answers: the file's bytes (`null` when it is absent), or why it could not be read. */
export type RecordReadOutcome =
  | Readonly<{ status: 'read'; bytes: RecordBytes | null }>
  | Readonly<{ status: 'failed'; error: unknown }>;

/** What the checked-write port is asked. */
export type CheckedWriteInput = Readonly<{
  writeId: number;
  data: string;
  expected: RecordBytes | null;
  kind: 'edit' | 'ensure' | 'reset';
  /** The command's request id, for an `ensure` or a `reset`; empty for an edit. */
  requestId: string;
}>;

const permanentReadCodes = new Set(['EACCES', 'EPERM']);

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isReading = (value: StateValue): boolean => matchesState({ source: 'reading' }, value);

const isQuiet = (value: StateValue): boolean => !matchesState({ intent: 'debouncing' }, value);

/** A waiting flush covers the pending edits that began before it, not ones made after it. */
const flushCovers = <T, P>(context: RecordSyncContext<T, P>): boolean =>
  context.flushes.length > 0 && context.pending !== undefined && context.pending.since <= context.flushedUpTo;

/** The edits of a debounce window count as due once the window ends, or at once when a waiting flush covers them. */
const hasWork = <T, P>(context: RecordSyncContext<T, P>, value: StateValue): boolean =>
  context.commands.length > 0 ||
  (context.pending !== undefined && (isQuiet(value) || flushCovers(context))) ||
  (context.flushes.length > 0 && (context.deferred !== undefined || context.readBack !== 'none'));

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 *
 * @param tla - The `RecordSync.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: RecordSyncAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/**
 * Events a state takes on purpose without a transition (MC-R17). The ports answer only the state that asked, and a
 * closed store's regions are final: the command surface answers for them without sending.
 */
export const recordSyncIgnoredEvents = [
  ['source.fenced', 'read'],
  ['source.fenced', 'retryRead'],
  ['source.fenced', 'invalidate'],
  ['source.fenced', 'close'],
  ['source.unread', 'invalidate'],
  ['source.observed', 'invalidate'],
  ['source.refused', 'invalidate'],
  ['source.backoff', 'invalidate'],
  ['source.unavailable', 'invalidate'],
  ['intent.fenced', 'edit'],
  ['intent.fenced', 'close'],
  ['write.fenced', 'ensure'],
  ['write.fenced', 'reset'],
  ['write.fenced', 'flush'],
  ['write.fenced', 'close'],
] as const satisfies ReadonlyArray<readonly [state: string, eventType: string]>;

/**
 * The machine over the erased record and patch types.
 *
 * @param policy - The record's codec and patch algebra; pure.
 * @returns The machine.
 */
const buildRecordSyncMachine = (policy: RecordPolicy<unknown, unknown>) => {
  type T = unknown;
  type P = unknown;
  type Context = RecordSyncContext<T, P>;
  type Patch = Partial<Context>;
  type Emit = { emit: (event: RecordSyncEmitted<T, P>) => void };
  type Enqueue = Emit & { raise: (event: RecordSyncEvent<T>) => void };
  /** A port that threw. Beside a cast `onDone`, xstate's config no longer types its sibling's arguments. */
  type FailedStep = { context: Context; event: { error: unknown } };
  /** One labelled transition of a port's answer. */
  type DoneStep<Output> = (
    args: { context: Context; event: { output: Output } },
    enq: Enqueue,
  ) => { target?: string; context?: Patch } | undefined;

  const readRecord = createAsyncLogic<RecordReadOutcome>({
    run: async () => {
      throw new Error('recordSync: the readRecord port was not provided; createRecordSync provides it.');
    },
  });

  const checkedWrite = createAsyncLogic<CheckedWriteOutcome, CheckedWriteInput>({
    run: async () => {
      throw new Error('recordSync: the checkedWrite port was not provided; createRecordSync provides it.');
    },
  });

  /**
   * Labelled transitions for a port's answer: xstate takes the first that returns a transition. Setup types admit
   * no transition arrays, so the steps are typed here and the array stands in for whatever the config expects.
   */
  type Either = <Output>(...transitions: Array<DoneStep<Output>>) => never;
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  const either = ((...transitions: unknown[]) => transitions) as unknown as Either;

  /** A context patch with the health it implies, announced when it changed. */
  const reported = (context: Context, patch: Patch, enq: Emit): Patch => {
    const next = { ...context, ...patch };
    const health: RecordHealth = {
      read: patch.health?.read ?? context.health.read,
      unconfirmed: next.slow || next.writeFailed,
      writing: next.inFlight !== undefined,
      error: patch.health?.error ?? context.health.error,
    };
    if (JSON.stringify(health) === JSON.stringify(context.health)) {
      return { ...patch, health: context.health };
    }
    enq.emit({ type: 'healthChanged', health });
    return { ...patch, health };
  };

  const answer = (enq: Emit, requestIds: readonly string[], ok: boolean): void => {
    if (requestIds.length > 0) {
      enq.emit({ type: 'answered', requestIds, ok });
    }
  };

  const snapshotOf = (shown: RecordSnapshot<T>, bytes: RecordBytes | null): RecordSnapshot<T> => {
    if (bytes === null) {
      return { record: undefined, bytes: null, refusal: undefined };
    }
    const result = policy.read(bytes);
    return result.status === 'current'
      ? { record: result.record, bytes, refusal: undefined }
      : { ...shown, bytes, refusal: { code: result.code, message: result.message } };
  };

  /** A read starts and supersedes the one in flight; its waiters wait for the latest. */
  const startRead = (context: Context, request: { requestId?: string; forced: boolean }): Patch => ({
    readRequests: request.requestId === undefined ? context.readRequests : [...context.readRequests, request.requestId],
    /* A forced read owes a publish until a read completes: one that supersedes or follows an abandoned one is forced. */
    readForced: request.forced || context.readForced,
    overlap: context.overlap || context.inFlight !== undefined,
    readBack: context.readBack === 'owed' ? 'reading' : context.readBack,
  });

  /** The read in flight will not complete: its waiters learn whether a record has been read at all. */
  const dropRead = (context: Context, enq: Emit): Patch => {
    answer(enq, context.readRequests, context.origin !== 'none');
    return { readRequests: [], readBack: context.readBack === 'reading' ? 'owed' : context.readBack };
  };

  const settledSource = (context: Context): 'unread' | 'refused' | 'observed' =>
    context.origin === 'none' ? 'unread' : context.published.refusal ? 'refused' : 'observed';

  /** The deferred patch as a cycle of its own, for a flush or the retry timer. */
  const deferredCycle = (context: Context, trigger: 'request' | 'timer'): Cycle<T, P> => ({
    kind: 'edit',
    trigger,
    next: context.intended ?? context.published.record,
    patch: context.deferred,
    reviewed: null,
    requests: [],
    attempt: 0,
    flushed: context.flushes.length > 0,
  });

  /** The next piece of work: a command first, then the pending edits over what is deferred, then the deferred patch. */
  const formCycle = (context: Context): { cycle: Cycle<T, P>; patch: Patch } => {
    const [command, ...commands] = context.commands;
    const flushed = context.flushes.length > 0;
    if (command) {
      return {
        cycle: {
          kind: command.kind,
          trigger: 'request',
          next: command.next,
          patch: undefined,
          reviewed: command.kind === 'reset' ? command.reviewed : null,
          requests: [command.requestId],
          attempt: 0,
          flushed,
          ...(command.kind === 'reset' && context.deferred !== undefined ? { replaces: context.deferred } : {}),
        },
        patch: command.kind === 'reset' ? { commands, deferred: undefined } : { commands },
      };
    }
    if (context.pending) {
      return {
        cycle: {
          kind: 'edit',
          trigger: 'edit',
          next: context.pending.next,
          patch: policy.combine(context.deferred, context.pending.patch),
          reviewed: null,
          requests: context.pending.requests,
          attempt: 0,
          flushed,
        },
        patch: { pending: undefined, deferred: undefined },
      };
    }
    return { cycle: deferredCycle(context, 'request'), patch: { deferred: undefined } };
  };

  /** The cycle ends: its requesters are answered, what it still owes is deferred, and a waiting flush learns the result. */
  const settle = (
    context: Context,
    enq: Emit,
    ending: { cycle: Cycle<T, P>; outcome: 'saved' | 'retry' | 'blocked'; failure?: { error: unknown } },
  ): { target: 'idle' | 'retrying' | 'fenced'; context: Patch } => {
    const { cycle, outcome, failure } = ending;
    const saved = outcome === 'saved';
    answer(enq, cycle.requests, saved);
    if (failure) {
      enq.emit({ type: 'failed', error: failure.error });
    }
    const latest = context.pending === undefined;
    const patch: { -readonly [K in keyof Context]?: Context[K] } = { cycle: undefined };
    let { deferred } = context;
    if (cycle.kind === 'edit') {
      /* The cycle carried what was deferred when it formed; edits deferred since (a reset's fold) come after it. */
      const owes = outcome === 'retry' || (cycle.patch !== undefined && !policy.isEmpty(cycle.patch));
      if (owes && !saved) {
        deferred = deferred === undefined ? cycle.patch : policy.combine(cycle.patch, deferred);
      }
      if (cycle.trigger === 'edit' && latest) {
        patch.intended = saved ? context.published.record : cycle.next;
      }
      if (saved) {
        patch.retryDelay = firstRetryDelay;
      } else if (outcome === 'retry' && cycle.trigger === 'timer') {
        patch.retryDelay = Math.min(context.retryDelay * 2, maxRetryDelay);
      }
    } else if (cycle.kind === 'reset') {
      /* A saved reset replaces what was deferred when it formed; edits folded in since (a later reset, the close) stay owed. */
      if (saved) {
        if (latest && deferred === undefined) {
          patch.intended = context.published.record;
        }
      } else if (cycle.replaces !== undefined) {
        deferred = deferred === undefined ? cycle.replaces : policy.combine(cycle.replaces, deferred);
      }
    }
    patch.deferred = deferred;
    if (failure) {
      patch.writeFailed = true;
      patch.health = { ...context.health, error: messageOf(failure.error) };
    } else if (saved && deferred === undefined && latest) {
      patch.writeFailed = false;
    }
    if (context.closeFenced) {
      answer(enq, context.flushes, saved && deferred === undefined);
      return { target: 'fenced', context: reported(context, { ...patch, flushes: [] }, enq) };
    }
    /* A command served while a deferred edit waited for its timer leaves that edit's retry due. */
    const retryOwed = deferred !== undefined && (outcome === 'retry' || (cycle.kind !== 'edit' && context.retryOwed));
    const owed =
      deferred !== undefined || flushCovers(context) || context.commands.length > 0 || context.readBack !== 'none';
    if (context.flushes.length > 0 && (!owed || (!saved && cycle.flushed && latest && context.commands.length === 0))) {
      answer(enq, context.flushes, !owed);
      patch.flushes = [];
    }
    return {
      target: retryOwed ? 'retrying' : 'idle',
      context: reported(context, { ...patch, retryOwed }, enq),
    };
  };

  /** A read failed: it backs off on the clock, or stops after {@link maxReadAttempts} or a permanent refusal. */
  const readFailed = (
    context: Context,
    error: unknown,
    enq: Emit & { raise: (event: { type: 'source.failed' }) => void },
  ): { target: 'unavailable' | 'backoff'; context: Patch } => {
    const readFailures = context.readFailures + 1;
    const stopped =
      permanentReadCodes.has((error as { code?: string } | undefined)?.code ?? '') || readFailures >= maxReadAttempts;
    enq.emit({ type: 'failed', error });
    answer(enq, context.readRequests, false);
    enq.raise({ type: 'source.failed' });
    return {
      target: stopped ? 'unavailable' : 'backoff',
      context: reported(
        context,
        {
          readRequests: [],
          readFailures,
          readBack: context.readBack === 'reading' ? 'owed' : context.readBack,
          health: { ...context.health, read: stopped ? 'unavailable' : 'retrying', error: messageOf(error) },
        },
        enq,
      ),
    };
  };

  /** A write's call failed. A lost reply keeps the write's entry (target rule 1) and owes a read-back. */
  const writeFailed = (
    context: Context,
    enq: Emit,
    failure: { error: unknown; lost: boolean },
  ): { target: 'idle' | 'retrying' | 'fenced'; context: Patch } => {
    const { error, lost } = failure;
    const { cycle, inFlight } = context;
    if (!cycle || !inFlight) {
      return { target: 'idle', context: { cycle: undefined, inFlight: undefined } };
    }
    const kept = lost
      ? context.ownWrites.map(
          (write): OwnWrite<P> => (write.writeId === inFlight.writeId ? { ...write, state: 'lost' } : write),
        )
      : context.ownWrites.filter((write) => write.writeId !== inFlight.writeId);
    const excess = kept.filter((write) => write.state === 'lost').length - maxLostWrites;
    const oldest = excess > 0 ? kept.find((write) => write.state === 'lost') : undefined;
    const ownWrites = oldest ? kept.filter((write) => write !== oldest) : kept;
    const readBack = lost ? 'owed' : context.readBack;
    const landed: Context = { ...context, ownWrites, readBack, inFlight: undefined, slow: false };
    const settled = settle(landed, enq, {
      cycle,
      outcome: context.closeFenced ? 'blocked' : 'retry',
      failure: { error },
    });
    return {
      target: settled.target,
      context: { ...settled.context, ownWrites, readBack, inFlight: undefined, slow: false },
    };
  };

  const machine = setup({
    schemas: {
      context: types<Context>(),
      events: eventSchemas<RecordSyncEvent<T>>(),
      emitted: eventSchemas<RecordSyncEmitted<T, P>>(),
      input: types<RecordSyncInput>(),
      transitionMeta: types<{ tla: RecordSyncAction }>(),
    },
    actors: { readRecord, checkedWrite },
    delays: {
      editDebounce: ({ context }) => context.editDebounce,
      readBackoff: ({ context }) => Math.min(firstRetryDelay * 2 ** (context.readFailures - 1), maxRetryDelay),
      retryDelay: ({ context }) => context.retryDelay,
      slowWrite: slowWriteMilliseconds,
    },
  }).createMachine({
    id: 'record-sync',
    version: '1',
    /* A fault no transition modelled is recorded; the composition root then answers every request `false` (MC-R12). */
    onError: refines('Unmodelled', ({ context, event }) => ({
      context: { fault: messageOf(event.error), faults: context.faults + 1 },
    })),
    context: ({ input }) => ({
      editDebounce: input.editDebounce ?? 0,
      published: { record: undefined, bytes: null, refusal: undefined },
      origin: 'none',
      patch: undefined,
      health: { read: 'ok', unconfirmed: false, writing: false, error: undefined },
      ownWrites: [],
      nextWriteId: 1,
      overlap: false,
      readRequests: [],
      readForced: false,
      readFailures: 0,
      readBack: 'none',
      intended: undefined,
      pending: undefined,
      edits: 0,
      flushedUpTo: 0,
      deferred: undefined,
      commands: [],
      flushes: [],
      cycle: undefined,
      inFlight: undefined,
      retryDelay: firstRetryDelay,
      slow: false,
      writeFailed: false,
      retryOwed: false,
      closeFenced: false,
      fault: undefined,
      faults: 0,
    }),
    type: 'parallel',
    states: {
      source: {
        initial: 'unread',
        on: {
          read: refines('WatchRead', ({ context, event, value }) =>
            matchesState({ source: 'fenced' }, value)
              ? undefined
              : {
                  target: '.reading',
                  reenter: true,
                  context: startRead(context, { requestId: event.requestId, forced: event.forced }),
                },
          ),
          retryRead: refines('ForcedRead', ({ context, event, value }, enq) =>
            matchesState({ source: 'fenced' }, value)
              ? undefined
              : {
                  target: '.reading',
                  reenter: true,
                  context: reported(
                    context,
                    {
                      ...startRead(context, { requestId: event.requestId, forced: true }),
                      readFailures: 0,
                      health: { ...context.health, read: 'retrying' },
                    },
                    enq,
                  ),
                },
          ),
          /* The writer needs the file's bytes: its first read, a read-back, a conflict read or a refresh. */
          'write.readRequested': refines('WatchRead', ({ context, value }) =>
            matchesState({ source: 'fenced' }, value)
              ? {}
              : { target: '.reading', reenter: true, context: startRead(context, { forced: false }) },
          ),
          close: refines('CloseFence', ({ context, value }, enq) => {
            if (matchesState({ source: 'fenced' }, value)) {
              return undefined;
            }
            answer(enq, context.readRequests, false);
            return { target: '.fenced', context: { readRequests: [] } };
          }),
          /* Stale outside `reading`: the read it would have superseded has already settled. */
          'write.published': refines('Unmodelled', () => ({})),
        },
        states: {
          unread: {},
          reading: {
            invoke: {
              src: 'readRecord',
              onDone: either<RecordReadOutcome>(
                refines('Unmodelled', ({ context, event }, enq) =>
                  event.output.status === 'failed' ? readFailed(context, event.output.error, enq) : undefined,
                ),
                refines('CompleteRead', ({ context, event }, enq) => {
                  if (event.output.status !== 'read') {
                    return undefined;
                  }
                  const { bytes } = event.output;
                  const hits = context.ownWrites.filter((write) => sameBytes(write.bytes, bytes));
                  const own = hits.at(-1);
                  const unchanged = context.origin !== 'none' && sameBytes(context.published.bytes, bytes);
                  const notify = !unchanged || context.readForced || context.readFailures > 0;
                  const published = notify ? snapshotOf(context.published, bytes) : context.published;
                  const origin = own ? 'own' : 'foreign';
                  if (notify) {
                    enq.emit({ type: 'published', snapshot: published, origin, patch: own?.patch });
                  }
                  answer(enq, context.readRequests, true);
                  enq.raise({ type: 'source.completed' });
                  const settledIntent =
                    context.pending === undefined && context.cycle === undefined && context.deferred === undefined;
                  return {
                    target: published.refusal ? 'refused' : 'observed',
                    context: reported(
                      context,
                      {
                        published,
                        origin,
                        patch: own?.patch,
                        // Target rule 3: only an acknowledged entry with other bytes goes.
                        ownWrites: context.ownWrites.filter(
                          (write) => write.state !== 'acknowledged' || sameBytes(write.bytes, bytes),
                        ),
                        // Target rule 5: a read that completes while a write is in flight overlaps it.
                        overlap: context.overlap || context.inFlight !== undefined,
                        readRequests: [],
                        readForced: false,
                        readFailures: 0,
                        readBack: context.readBack === 'reading' ? 'none' : context.readBack,
                        health: { ...context.health, read: 'ok' },
                        ...(notify && !own && !published.refusal && settledIntent
                          ? { intended: published.record }
                          : {}),
                      },
                      enq,
                    ),
                  };
                }),
              ),
              /* A defect in the port itself; the store treats it as a failed read. */
              onError: refines('Unmodelled', ({ context, event }: FailedStep, enq: Enqueue) =>
                readFailed(context, event.error, enq),
              ),
            },
            on: {
              invalidate: refines('Unmodelled', ({ context }, enq) => {
                enq.raise({ type: 'source.abandoned' });
                return { target: settledSource(context), context: dropRead(context, enq) };
              }),
              /* Target rule 5: the reply of a write no read overlapped supersedes the read in flight. */
              /* The authority answered the write, so a read retry this supersedes is no longer owed. */
              'write.published': refines('ReplyApplied', ({ context }, enq) => ({
                target: settledSource(context),
                context: reported(
                  context,
                  {
                    ...dropRead(context, enq),
                    readForced: false,
                    readFailures: 0,
                    health: { ...context.health, read: 'ok' },
                  },
                  enq,
                ),
              })),
            },
          },
          observed: {},
          refused: {},
          backoff: {
            after: {
              readBackoff: refines('WatchRead', ({ context }) => ({
                target: 'reading',
                context: startRead(context, { forced: false }),
              })),
            },
          },
          /** Automatic retry stopped; a change event or *Try again* reads again. */
          unavailable: {},
          fenced: { type: 'final' },
        },
      },
      intent: {
        initial: 'quiet',
        on: {
          close: refines('CloseFence', ({ value }) =>
            matchesState({ intent: 'fenced' }, value) ? undefined : { target: '.fenced' },
          ),
        },
        states: {
          quiet: {
            on: {
              edit: refines('Edit', ({ context, event }) => ({
                ...(context.editDebounce > 0 ? { target: 'debouncing' } : {}),
                context: accumulate(context, event),
              })),
            },
          },
          debouncing: {
            after: { editDebounce: { target: 'quiet' } },
            on: {
              edit: refines('Edit', ({ context, event }) => ({
                target: 'debouncing',
                reenter: true,
                context: accumulate(context, event),
              })),
              flush: { target: 'quiet' },
              /* A reset replaces the record: the edits waiting here are folded into what is deferred. */
              reset: { target: 'quiet' },
            },
          },
          fenced: { type: 'final' },
        },
      },
      write: {
        initial: 'idle',
        on: {
          flush: refines('Unmodelled', ({ context, event, value }) =>
            matchesState({ write: 'fenced' }, value)
              ? undefined
              : { context: { flushes: [...context.flushes, event.requestId], flushedUpTo: context.edits } },
          ),
          ensure: refines('Unmodelled', ({ context, event, value }) =>
            matchesState({ write: 'fenced' }, value)
              ? undefined
              : {
                  context: {
                    commands: [...context.commands, { kind: 'ensure', requestId: event.requestId, next: event.seed }],
                  },
                },
          ),
          reset: refines('Unmodelled', ({ context, event, value }, enq) => {
            if (matchesState({ write: 'fenced' }, value)) {
              return undefined;
            }
            if (context.closeFenced || context.published.refusal?.code !== 'INVALID_RECORD') {
              answer(enq, [event.requestId], false);
              return {};
            }
            /* The edits that waited are refused with the record they were made against; the reset, once saved, replaces them. */
            answer(enq, context.pending?.requests ?? [], false);
            const folded = context.pending ? policy.combine(context.deferred, context.pending.patch) : context.deferred;
            return {
              context: {
                pending: undefined,
                deferred: folded !== undefined && !policy.isEmpty(folded) ? folded : undefined,
                commands: [
                  ...context.commands,
                  { kind: 'reset', requestId: event.requestId, next: event.next, reviewed: event.reviewed },
                ],
              },
            };
          }),
          close: refines('CloseFence', ({ context, value }, enq) => {
            if (matchesState({ write: 'fenced' }, value)) {
              return undefined;
            }
            /* Target rule 7. Edits no write has taken stay owed, so a flush after the close says so. */
            answer(enq, context.pending?.requests ?? [], false);
            answer(
              enq,
              context.commands.map((command) => command.requestId),
              false,
            );
            /* No cycle carries what is deferred, so settling the cycle on the wire folds these edits in, not over. */
            const folded = context.pending ? policy.combine(context.deferred, context.pending.patch) : context.deferred;
            const deferred = folded !== undefined && !policy.isEmpty(folded) ? folded : undefined;
            const fenced = { closeFenced: true, pending: undefined, commands: [], deferred };
            if (matchesState({ write: 'writing' }, value)) {
              /* The write on the wire still answers its requesters; nothing is published after the close. */
              return { context: fenced };
            }
            const { cycle } = context;
            if (cycle) {
              /* An overlapped write was applied, so only its refresh read is abandoned; a cycle waiting for a base is blocked. */
              const applied = matchesState({ write: 'awaitingRefresh' }, value);
              const settled = settle({ ...context, ...fenced }, enq, { cycle, outcome: applied ? 'saved' : 'blocked' });
              return { target: '.fenced', context: { ...fenced, ...settled.context } };
            }
            answer(enq, context.flushes, deferred === undefined);
            return { target: '.fenced', context: { ...fenced, flushes: [] } };
          }),
          /* Stale outside the two waiting states: the writer was not waiting for this read. */
          'source.completed': refines('Unmodelled', () => ({})),
          'source.failed': refines('Unmodelled', () => ({})),
          'source.abandoned': refines('Unmodelled', () => ({})),
        },
        states: {
          idle: {
            always: refines('Unmodelled', ({ context, value }, enq) => {
              if (hasWork(context, value)) {
                return { target: 'starting' };
              }
              if (context.flushes.length === 0) {
                return undefined;
              }
              /* Nothing is owed: the flush is done. */
              answer(enq, context.flushes, true);
              return { context: reported(context, { flushes: [], writeFailed: false }, enq) };
            }),
          },
          /**
           * Transient: decides what the writer does next. It waits for a read when it has no base or a reply was
           * lost, ends the cycle when nothing can or need be written, and otherwise issues the one checked write.
           */
          starting: {
            always: refines('IssueWrite', ({ context, value }, enq) => {
              const formed = context.cycle ? { cycle: context.cycle, patch: {} } : formCycle(context);
              const { cycle } = formed;
              const current: Context = { ...context, ...formed.patch, cycle };
              const end = (
                outcome: 'saved' | 'retry' | 'blocked',
                failure?: { error: unknown },
              ): { target: 'idle' | 'retrying' | 'fenced'; context: Patch } => {
                const settled = settle(current, enq, { cycle, outcome, failure });
                return { target: settled.target, context: { ...formed.patch, ...settled.context } };
              };
              if (context.closeFenced) {
                return end('blocked');
              }
              if (context.origin === 'none' || context.readBack !== 'none') {
                if (context.readBack === 'owed' || (context.readBack === 'none' && !isReading(value))) {
                  enq.raise({ type: 'write.readRequested' });
                }
                return { target: 'awaitingBase', context: { ...formed.patch, cycle } };
              }
              const { published } = context;
              if (cycle.kind === 'reset') {
                if (
                  published.refusal?.code !== 'INVALID_RECORD' ||
                  !sameBytes(published.bytes, cycle.reviewed) ||
                  cycle.attempt > 0
                ) {
                  return end('blocked');
                }
              } else if (published.refusal) {
                return end('blocked');
              }
              if (cycle.kind === 'ensure') {
                if (published.bytes !== null) {
                  return end('saved');
                }
                if (cycle.attempt > 0) {
                  return end('blocked');
                }
              }
              if (cycle.kind === 'edit') {
                if (cycle.patch === undefined || policy.isEmpty(cycle.patch) || cycle.next === undefined) {
                  return end('saved');
                }
                if (cycle.attempt >= maxWriteAttempts) {
                  return end('retry', {
                    error: new Error('The record changed while it was being saved. Try again.'),
                  });
                }
              }
              let data: string;
              try {
                const merged =
                  cycle.kind === 'edit' && cycle.patch !== undefined && cycle.next !== undefined
                    ? policy.merge(published.record, cycle.next, cycle.patch)
                    : cycle.next;
                if (merged === undefined) {
                  return end('saved');
                }
                data = policy.serialize(merged);
                if (cycle.kind === 'edit' && published.record && data === policy.serialize(published.record)) {
                  return end('saved');
                }
              } catch (error) {
                return end('retry', { error });
              }
              const writeId = context.nextWriteId;
              const patch =
                cycle.kind === 'reset'
                  ? undefined
                  : cycle.kind === 'ensure' && cycle.next !== undefined
                    ? policy.diff(undefined, cycle.next)
                    : cycle.patch;
              return {
                target: 'writing',
                context: reported(
                  context,
                  {
                    ...formed.patch,
                    cycle: { ...cycle, attempt: cycle.attempt + 1 },
                    // Target rule 1: the entry exists from the moment the write is issued.
                    ownWrites: [
                      ...context.ownWrites,
                      { writeId, bytes: new TextEncoder().encode(data), patch, state: 'inFlight' },
                    ],
                    nextWriteId: writeId + 1,
                    overlap: false,
                    inFlight: {
                      writeId,
                      data,
                      expected: cycle.kind === 'reset' ? cycle.reviewed : published.bytes,
                      requestId: cycle.kind === 'edit' ? '' : (cycle.requests[0] ?? ''),
                    },
                  },
                  enq,
                ),
              };
            }),
          },
          /** The writer has no base to write on: it waits for the latest read (target rule 6). */
          awaitingBase: {
            on: {
              'source.completed': { target: 'starting' },
              'source.failed': refines('Unmodelled', ({ context }, enq) =>
                context.cycle ? settle(context, enq, { cycle: context.cycle, outcome: 'retry' }) : { target: 'idle' },
              ),
              'source.abandoned': refines('Unmodelled', (_, enq) => {
                enq.raise({ type: 'write.readRequested' });
                return {};
              }),
            },
          },
          writing: {
            invoke: {
              src: 'checkedWrite',
              input: ({ context }) => ({
                writeId: context.inFlight?.writeId ?? 0,
                data: context.inFlight?.data ?? '',
                expected: context.inFlight?.expected ?? null,
                kind: context.cycle?.kind ?? 'edit',
                requestId: context.inFlight?.requestId ?? '',
              }),
              onDone: either<CheckedWriteOutcome>(
                refines('ReplyConflict', ({ context, event }, enq) => {
                  const { cycle, inFlight } = context;
                  if (
                    (event.output.status !== 'conflict' && event.output.status !== 'ineligible') ||
                    !cycle ||
                    !inFlight
                  ) {
                    return undefined;
                  }
                  // Target rule 1: a conflict removes only its own write's entry.
                  const ownWrites = context.ownWrites.filter((write) => write.writeId !== inFlight.writeId);
                  const landed: Context = { ...context, ownWrites, inFlight: undefined, slow: false };
                  if (context.closeFenced || event.output.status === 'ineligible') {
                    const settled = settle(landed, enq, { cycle, outcome: 'blocked' });
                    return {
                      target: settled.target,
                      context: { ...settled.context, ownWrites, inFlight: undefined, slow: false },
                    };
                  }
                  enq.raise({ type: 'write.readRequested' });
                  return {
                    target: 'awaitingBase',
                    context: reported(context, { ownWrites, inFlight: undefined, slow: false }, enq),
                  };
                }),
                refines('LoseReply', ({ context, event }, enq) =>
                  event.output.status === 'failed'
                    ? writeFailed(context, enq, { error: event.output.error, lost: event.output.lost })
                    : undefined,
                ),
                refines('ReplyApplied', ({ context, event }, enq) => {
                  const { cycle, inFlight } = context;
                  if (event.output.status !== 'applied' || !cycle || !inFlight) {
                    return { target: 'idle', context: { cycle: undefined, inFlight: undefined } };
                  }
                  // Target rule 4: this acknowledgement drops the earlier acknowledged entries.
                  const ownWrites = context.ownWrites
                    .filter((write) => write.state !== 'acknowledged')
                    .map(
                      (write): OwnWrite<P> =>
                        write.writeId === inFlight.writeId ? { ...write, state: 'acknowledged' } : write,
                    );
                  const acknowledged = ownWrites.find((write) => write.writeId === inFlight.writeId);
                  const landed: Context = { ...context, ownWrites, inFlight: undefined, slow: false };
                  if (context.closeFenced) {
                    const settled = settle(landed, enq, { cycle, outcome: 'saved' });
                    return {
                      target: settled.target,
                      context: { ...settled.context, ownWrites, inFlight: undefined, slow: false },
                    };
                  }
                  if (context.overlap) {
                    /* Target rule 5: a read overlapped this write, so the reply publishes nothing and a refresh read does. */
                    enq.raise({ type: 'write.readRequested' });
                    return {
                      target: 'awaitingRefresh',
                      context: reported(context, { ownWrites, inFlight: undefined, slow: false }, enq),
                    };
                  }
                  const { content } = event.output;
                  const unchanged = context.origin !== 'none' && sameBytes(context.published.bytes, content);
                  const published = unchanged ? context.published : snapshotOf(context.published, content);
                  if (!unchanged) {
                    enq.emit({ type: 'published', snapshot: published, origin: 'own', patch: acknowledged?.patch });
                  }
                  enq.raise({ type: 'write.published' });
                  const shown: Context = { ...landed, published, origin: 'own', patch: acknowledged?.patch };
                  const settled = settle(shown, enq, { cycle, outcome: 'saved' });
                  return {
                    target: settled.target,
                    context: {
                      ...settled.context,
                      ownWrites,
                      published,
                      origin: 'own',
                      patch: acknowledged?.patch,
                      inFlight: undefined,
                      slow: false,
                    },
                  };
                }),
              ),
              /* A defect in the port itself; the store treats it as a write that reached no authority. */
              onError: refines('Unmodelled', ({ context, event }: FailedStep, enq: Enqueue) =>
                writeFailed(context, enq, { error: event.error, lost: false }),
              ),
            },
            after: {
              slowWrite: refines('Unmodelled', ({ context }, enq) => ({
                context: reported(context, { slow: true }, enq),
              })),
            },
          },
          /** An overlapped write was applied: the cycle ends when the latest read has published (target rule 6). */
          awaitingRefresh: {
            on: {
              'source.completed': refines('CompleteRead', ({ context }, enq) =>
                context.cycle ? settle(context, enq, { cycle: context.cycle, outcome: 'saved' }) : { target: 'idle' },
              ),
              /* The write is on the file whether or not it could be read back. */
              'source.failed': refines('Unmodelled', ({ context }, enq) =>
                context.cycle ? settle(context, enq, { cycle: context.cycle, outcome: 'saved' }) : { target: 'idle' },
              ),
              /* Target rule 6: the writer waits for the latest read, so an abandoned refresh is asked for again. */
              'source.abandoned': refines('Unmodelled', (_, enq) => {
                enq.raise({ type: 'write.readRequested' });
                return {};
              }),
            },
          },
          /** A write failed; it is tried again after `retryDelay`, or at once on an edit, a command or a flush. */
          retrying: {
            always: ({ context, value }) => (hasWork(context, value) ? { target: 'starting' } : undefined),
            after: {
              retryDelay: refines('IssueWrite', ({ context }) => ({
                target: 'starting',
                context: { cycle: deferredCycle(context, 'timer'), deferred: undefined },
              })),
            },
          },
          fenced: { type: 'final' },
        },
      },
    },
  });

  function accumulate(context: Context, event: { requestId: string; next: T }): Patch {
    const base = context.origin === 'none' ? undefined : (context.intended ?? context.published.record);
    const edits = context.edits + 1;
    return {
      intended: event.next,
      edits,
      pending: {
        next: event.next,
        patch: policy.combine(context.pending?.patch, policy.diff(base, event.next)),
        requests: [...(context.pending?.requests ?? []), event.requestId],
        since: context.pending?.since ?? edits,
      },
    };
  }

  return machine;
};

declare const recordKind: unique symbol;

/**
 * The `recordSync` machine of one record kind. The machine is built over the erased record and patch types, because
 * xstate's setup types do not resolve over a type parameter; `T` and `P` are carried for `createRecordSync`, which
 * types the commands, the context and the emitted events with them.
 */
export type RecordSyncMachine<T, P> = ReturnType<typeof buildRecordSyncMachine> & {
  readonly [recordKind]?: readonly [record: T, patch: P];
};

/**
 * The `recordSync` machine for one record kind.
 *
 * @param policy - The record's codec and patch algebra; pure.
 * @returns The machine. Its two port actors throw until a composition root provides them.
 */
export const createRecordSyncMachine = <T, P>(policy: RecordPolicy<T, P>): RecordSyncMachine<T, P> =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the policy is only ever given its own records and patches back.
  buildRecordSyncMachine(policy as unknown as RecordPolicy<unknown, unknown>);
