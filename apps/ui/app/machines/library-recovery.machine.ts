/**
 * `libraryRecovery`: one tab's account of the pending-operation journal, its replay loop and the gate it puts on
 * mutations (app state orchestration charter D2, D3, D4, D10, D13, D23; invariant I8; plan § 4 A3a; inventory L1,
 * L2, L5).
 *
 * The protocol is `apps/ui/specs/library-catalog/LibraryCatalog.tla`. This machine keeps its README's rules 4 to 7:
 *
 * 4. A mutation on a project waits while this tab holds a waiting or replaying row for it, or another admitted
 *    mutation of the same project. A failed, recovered or discarded row does not gate.
 * 5. Every row this tab has read from the journal has one state: `waiting`, `replaying`, `recovered`, `failed` or
 *    `discarded`. A row fails at once on a terminal reason (`identity-conflict`, `filesystem-error`,
 *    `local-state-error`) and is never replayed again in this tab; only the replay loop counts attempts, one before
 *    each replay and no fourth; a mutation's own row starts with none. Only the person discards, and only a failed row.
 * 6. A row that fails with `workspace-unavailable` keeps its attempts and is replayed again only when its workspace
 *    is back: `workspaceReturned`, or a `retryRequested` whose workspace check finds it present. That second path is
 *    a named change (programme control, 2026-11-13T08:13Z): today every cross-tab or desktop root-configuration
 *    message (`use-project-manager.tsx` 2135 to 2151) and every `prepareCurrentWorkspaceCatalog` (2840 to 2846) replay
 *    such a row with no check. A lapsed permission (`'prompt'`) with its handle held counts as present (D14); the check
 *    port decides. `replayAsked`, the replay `createProject(id)` makes under its named lock (2302 to 2306), is the one
 *    replay outside this rule, kept as today.
 * 7. Replays run one at a time. A row re-armed by a workspace check or return joins the one loop; today
 *    `retryFailedRecoveries` settles them in a loop of its own that can overlap the startup loop (named difference).
 *    A mutation's own row settles beside the loop.
 *
 * Attempt counts live in context and per tab: a reload reads every journal row again as `waiting` with none, as today.
 * Context holds each row's recovery projection (operation id, project, kind and storage), never the operation's files
 * (MC-R5); the replay port reads the operation it replays. Nothing in the app runs this machine yet: A3b wires it.
 *
 * @module
 */
import { createActor, createAsyncLogic, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, SnapshotFrom } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { PendingProjectRecovery, PendingProjectRecoveryReason } from '#types/pending-project-operation.types.js';

/** The `LibraryCatalog.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. */
export type LibraryRecoveryAction =
  | 'MutationJournaled'
  | 'ReplayStarted'
  | 'ReplaySettled'
  | 'PersonDiscarded'
  | 'WorkspaceReturned'
  | 'Unmodelled';

/** Settle attempts per row per tab (DF11): the loop makes no fourth. */
export const maxRecoveryAttempts = 3;

/** Reasons a later attempt cannot change (DF11). */
export const terminalRecoveryReasons: ReadonlySet<PendingProjectRecoveryReason> = new Set([
  'identity-conflict',
  'filesystem-error',
  'local-state-error',
]);

/** One journal row as this tab reads it: the recovery projection, and the workspace its storage cites. */
export type RecoveryRowInput = Readonly<
  Omit<Extract<PendingProjectRecovery, { status: 'recovering' }>, 'status'> & {
    /** The workspace the row's storage cites (top level or under `.storage`); absent for Home backends. */
    workspaceId?: string;
  }
>;

type RowBase = RecoveryRowInput &
  Readonly<{
    /** Replays the loop has counted for this row in this tab. */
    attempts: number;
    /** Whose replay the row's last start was: the loop's, a mutation's own, or the person's (`createProject(id)`). */
    via: 'journal' | 'mutation' | 'person';
  }>;

/** One row's state (rule 5). */
export type RecoveryRow =
  | (RowBase & Readonly<{ status: 'waiting' | 'replaying' | 'recovered' | 'discarded' }>)
  | (RowBase & Readonly<{ status: 'failed'; reason: PendingProjectRecoveryReason; discarding: boolean }>);

/**
 * What a replay or a mutation's own apply settled as. `absent`: the journal no longer holds the row, because another
 * tab settled it; it counts as recovered here (today `retryFailedRecoveries` skips such a row), so it is never
 * replayed again.
 */
export type ReplayOutcome =
  | Readonly<{ status: 'recovered' }>
  | Readonly<{ status: 'failed'; reason: PendingProjectRecoveryReason }>
  | Readonly<{ status: 'absent' }>;

/** The replay in flight: whose it is, and the row as it was before it, for an `absent` answer. */
type Replay = Readonly<{ operationId: string; requestId: string | undefined }>;

/** State owned by one `libraryRecovery` actor. */
export type LibraryRecoveryContext = Readonly<{
  /** Every row this tab has seen, by operation id. */
  rows: Readonly<Record<string, RecoveryRow>>;
  /** Journal order, the order the loop replays in. */
  order: readonly string[];
  /** The bootstrap discovery pass has run: the loop may replay (discovery before replay, as today). */
  allowed: boolean;
  /** The bootstrap pass failed and no caller has asked for it again since. */
  bootstrapFailed: boolean;
  /** The loop's replay in flight. */
  replay: Replay | undefined;
  /** Mutations admitted and not yet journaled, by request id. */
  admitted: Readonly<Record<string, string>>;
  /** Mutations waiting for the gate, in arrival order. */
  asked: ReadonlyArray<Readonly<{ requestId: string; projectId: string }>>;
  /** The person's replays (`createProject(id)`), waiting for the loop to drain. */
  personReplays: ReadonlyArray<Readonly<{ requestId: string; row: RecoveryRowInput }>>;
  /** Another `retryRequested` arrived while a workspace check ran. */
  recheck: boolean;
  /** The attempts of each row the running workspace check asks about: a row replayed since is not re-armed by it. */
  checked: Readonly<Record<string, number>>;
  /** Discards waiting behind the one in flight. */
  discards: ReadonlyArray<Readonly<{ requestId: string; operationId: string }>>;
  /** Why the journal could not be read, until it is. */
  loadError: string | undefined;
  /** The first defect the root `onError` caught (MC-R12, D23). */
  fault: string | undefined;
}>;

/** Events a `libraryRecovery` actor takes. */
export type LibraryRecoveryEvent =
  /** Read the journal again after a failed read. */
  | { type: 'load' }
  /** The bootstrap discovery pass has run: the loop may start. */
  | { type: 'discoveryReady' }
  /** The bootstrap discovery pass failed: the next replay or mutation asks for it again (`discoveryWanted`). */
  | { type: 'discoveryFailed' }
  /** A mutation on `projectId` asks the gate (rule 4); answered `mutationAdmitted`. */
  | { type: 'mutationAsked'; requestId: string; projectId: string }
  /** The admitted mutation wrote its journal row and starts applying it. */
  | { type: 'mutationJournaled'; requestId: string; row: RecoveryRowInput }
  /** The admitted or waiting mutation wrote no row. */
  | { type: 'mutationAbandoned'; requestId: string }
  /** A mutation's own apply settled. */
  | { type: 'mutationSettled'; operationId: string; outcome: ReplayOutcome }
  /**
   * The workspace is back (a re-pick): the `workspace-unavailable` rows whose storage cites it are replayed again.
   * Absent: every one. A row whose storage cites no workspace (a node folder) waits for the absent form or a retry.
   */
  | { type: 'workspaceReturned'; workspaceId?: string }
  /** A root-configuration message or a catalog refresh: replay a `workspace-unavailable` row whose workspace a check finds present. */
  | { type: 'retryRequested' }
  /** `createProject(id)` settles the project's unfinished row first, under its named lock. */
  | { type: 'replayAsked'; requestId: string; row: RecoveryRowInput }
  /** The person discards a failed row. */
  | { type: 'discardAsked'; requestId: string; operationId: string };

/** Events a `libraryRecovery` actor emits. */
export type LibraryRecoveryEmitted =
  | { type: 'journalReady'; pending: number }
  | { type: 'journalFailed'; message: string }
  /**
   * A replay or a mutation arrived after the bootstrap pass failed: run it again, as today's `createProject(id)` and
   * mutations do through `ensureDiscoveryReady`.
   */
  | { type: 'discoveryWanted' }
  /** A row for `projectId` started a replay or a mutation's apply: the access fence's `rs`. */
  | { type: 'rowStarted'; operationId: string; projectId: string }
  /** A row settled or was discarded: storage may have changed, so the listing owes a pass. */
  | { type: 'rowSettled'; operationId: string; projectId: string }
  /** What this tab holds changed: the recovery projection the library shows and route access reads. */
  | { type: 'recoveriesChanged'; recoveries: readonly PendingProjectRecovery[] }
  | { type: 'mutationAdmitted'; requestId: string }
  /** The person's replay ended; `held` when the row is still held (failed or skipped). */
  | { type: 'replaySettled'; requestId: string; held: boolean }
  | { type: 'discardSettled'; requestId: string; ok: boolean };

/** The public alphabet (MC-R17). */
export const libraryRecoveryEventTypes = [
  'load',
  'discoveryReady',
  'discoveryFailed',
  'mutationAsked',
  'mutationJournaled',
  'mutationAbandoned',
  'mutationSettled',
  'workspaceReturned',
  'retryRequested',
  'replayAsked',
  'discardAsked',
] as const satisfies ReadonlyArray<LibraryRecoveryEvent['type']>;

/**
 * Pairs a state takes without a transition (MC-R17). A retry checks the workspaces of the rows the journal holds, so
 * before it is read there is nothing to check: the replay of each row it reads sees the workspace as it is. `load` is
 * for a failed read only.
 */
export const libraryRecoveryIgnoredEvents = [
  ['loading', 'load'],
  ['loading', 'retryRequested'],
  ['loadFailed', 'retryRequested'],
  ['ready', 'load'],
] as const satisfies ReadonlyArray<readonly [state: string, eventType: string]>;

type Context = LibraryRecoveryContext;
type Patch = { -readonly [K in keyof Context]?: Context[K] };
type Emit = { emit: (event: LibraryRecoveryEmitted) => void };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 *
 * @param tla - The `LibraryCatalog.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: LibraryRecoveryAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

type Step = { target?: string; reenter?: boolean; context?: Patch };
/** An invoke's answer, typed by hand: alpha.59 cannot type a `{ to, meta }` `onDone`'s arguments. */
type Done<Output> = Readonly<{ context: Context; event: Readonly<{ output: Output }> }>;
type Failed = Readonly<{ context: Context; event: Readonly<{ error: unknown }> }>;

type Settles = <Args>(tla: LibraryRecoveryAction, to: (args: Args, enq: Emit) => Step) => never;
/**
 * An invoke's `onDone` or `onError` as `{ to, meta }` (MC-R27), with its arguments typed by hand.
 *
 * @param tla - The `LibraryCatalog.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, as whatever the config expects.
 */
// oxlint-disable-next-line typescript/consistent-type-assertions -- see `refines`.
const settles = ((tla: LibraryRecoveryAction, to: unknown) => ({ meta: { tla }, to })) as unknown as Settles;

const isActive = (row: RecoveryRow): boolean => row.status === 'waiting' || row.status === 'replaying';
const isHeld = (row: RecoveryRow): boolean => isActive(row) || row.status === 'failed';

/** The rows this tab holds, as the library shows them and route access reads them (today `recoveriesRef`). */
export const recoveriesOf = (context: Context): PendingProjectRecovery[] =>
  context.order.flatMap((operationId): PendingProjectRecovery[] => {
    const row = context.rows[operationId];
    if (row === undefined || !isHeld(row)) {
      return [];
    }
    const { operationId: id, projectId, kind, storage } = row;
    return [
      row.status === 'failed'
        ? { operationId: id, projectId, kind, storage, status: 'failed', reason: row.reason }
        : { operationId: id, projectId, kind, storage, status: 'recovering' },
    ];
  });

/**
 * Rule 4: a mutation on `projectId` waits while an active row or another admitted mutation holds it. A person's replay
 * still queued holds it too: its row may be one this tab has not read yet, and it must not run after a newer mutation.
 */
const gated = (context: Context, projectId: string): boolean =>
  Object.values(context.rows).some((row) => row.projectId === projectId && isActive(row)) ||
  context.personReplays.some((replay) => replay.row.projectId === projectId) ||
  Object.values(context.admitted).includes(projectId);

/** Ask for the failed bootstrap pass again, once per failure, for a caller that needs it (today's next call). */
const wantDiscovery = (context: Context, enq: Emit): Patch => {
  if (!context.bootstrapFailed) {
    return {};
  }
  enq.emit({ type: 'discoveryWanted' });
  return { bootstrapFailed: false };
};

/** The workspace a row's storage cites: the top-level field the host gave, else a `webaccess` storage's own. */
const workspaceOf = (row: RecoveryRowInput): string | undefined =>
  row.workspaceId ?? (row.storage.backend === 'webaccess' ? row.storage.workspaceId : undefined);

/** Announce what this tab holds, when that changed. */
const changed = (before: Context, patch: Patch, enq: Emit): Patch => {
  const after = recoveriesOf({ ...before, ...patch });
  if (JSON.stringify(after) !== JSON.stringify(recoveriesOf(before))) {
    enq.emit({ type: 'recoveriesChanged', recoveries: after });
  }
  return patch;
};

/** Admit every waiting mutation the gate now lets through, in arrival order. */
const admitWaiting = (context: Context, enq: Emit): Patch => {
  let { admitted } = context;
  const asked: Array<Context['asked'][number]> = [];
  for (const ask of context.asked) {
    if (gated({ ...context, admitted }, ask.projectId)) {
      asked.push(ask);
      continue;
    }
    admitted = { ...admitted, [ask.requestId]: ask.projectId };
    enq.emit({ type: 'mutationAdmitted', requestId: ask.requestId });
  }
  return asked.length === context.asked.length ? {} : { admitted, asked };
};

/** The rows a returned workspace re-arms: failed for the workspace, under the cap, not being discarded. */
const rearmable = (row: RecoveryRow): row is Extract<RecoveryRow, { status: 'failed' }> =>
  row.status === 'failed' &&
  row.reason === 'workspace-unavailable' &&
  !row.discarding &&
  row.attempts < maxRecoveryAttempts;

/** The attempts of every row a workspace check would ask about. */
const checkedOf = (context: Context): Record<string, number> =>
  Object.fromEntries(
    Object.values(context.rows).flatMap((row) => (rearmable(row) ? [[row.operationId, row.attempts]] : [])),
  );

/** Re-arm the given rows: each goes back to `waiting` for the one loop (rules 6 and 7). */
const rearm = (context: Context, operationIds: readonly string[], enq: Emit): Patch => {
  const rows = { ...context.rows };
  for (const operationId of operationIds) {
    const row = rows[operationId];
    if (row !== undefined && rearmable(row)) {
      const { reason: _reason, discarding: _discarding, ...rest } = row;
      rows[operationId] = { ...rest, status: 'waiting', via: 'journal' };
    }
  }
  return changed(context, { rows }, enq);
};

/** A row settled: recovered (or gone from the journal), or failed with its reason and the attempts it has. */
const settleRow = (
  context: Context,
  enq: Emit,
  { row, outcome, admit = true }: Readonly<{ row: RecoveryRow; outcome: ReplayOutcome; admit?: boolean }>,
): Patch => {
  const next: RecoveryRow =
    outcome.status === 'failed'
      ? { ...row, status: 'failed', reason: outcome.reason, discarding: false }
      : { ...row, status: 'recovered' };
  // Storage may have changed either way, so the listing owes a pass (the model's `Bump`).
  enq.emit({ type: 'rowSettled', operationId: row.operationId, projectId: row.projectId });
  const settled = { ...context, rows: { ...context.rows, [row.operationId]: next } };
  return changed(context, { rows: settled.rows, ...(admit ? admitWaiting(settled, enq) : {}) }, enq);
};

/** A mutation's own apply settled; anything but its own applying row is a late or repeated report. */
const mutationSettled = (
  context: Context,
  enq: Emit,
  { event, admit }: Readonly<{ event: Extract<LibraryRecoveryEvent, { type: 'mutationSettled' }>; admit: boolean }>,
): { context?: Patch } => {
  const row = context.rows[event.operationId];
  if (row?.status !== 'replaying' || row.via !== 'mutation') {
    return {};
  }
  return { context: settleRow(context, enq, { row, outcome: event.outcome, admit }) };
};

/** Add a row this tab had not seen (another tab's, read again by `createProject(id)`). */
const withRow = (context: Context, input: RecoveryRowInput): Context =>
  context.rows[input.operationId] === undefined
    ? {
        ...context,
        rows: { ...context.rows, [input.operationId]: { ...input, status: 'waiting', attempts: 0, via: 'person' } },
        order: [...context.order, input.operationId],
      }
    : context;

/**
 * The next replay for the loop: a waiting row in journal order, then the person's replays once none waits. A project
 * with a mutation admitted or applying is passed over until it settles: admission and journaling are one step in the
 * model (`MutationJournaled` requires no active row), so no row of that project starts between them.
 */
const nextReplay = (
  context: Context,
): Readonly<{ operationId: string; requestId: string | undefined; context: Context }> | undefined => {
  if (!context.allowed || context.replay !== undefined) {
    return undefined;
  }
  // A project whose mutation is admitted or applying its own row: its other rows wait for that mutation to settle.
  const admitted = new Set([
    ...Object.values(context.admitted),
    ...Object.values(context.rows).flatMap((row) =>
      row.status === 'replaying' && row.via === 'mutation' ? [row.projectId] : [],
    ),
  ]);
  const waiting = context.order.find((operationId) => {
    const row = context.rows[operationId];
    return row?.status === 'waiting' && !admitted.has(row.projectId);
  });
  if (waiting !== undefined) {
    return { operationId: waiting, requestId: undefined, context };
  }
  // The first person's replay whose project is free: one held by a mutation does not hold another project's replay.
  const index = context.personReplays.findIndex((queued) => !admitted.has(queued.row.projectId));
  const person = context.personReplays[index];
  if (person === undefined) {
    return undefined;
  }
  return {
    operationId: person.row.operationId,
    requestId: person.requestId,
    context: {
      ...withRow(context, person.row),
      personReplays: context.personReplays.filter((_queued, position) => position !== index),
    },
  };
};

const readJournal = createAsyncLogic<readonly RecoveryRowInput[]>({
  run: async () => {
    throw new Error('libraryRecovery: the readJournal port was not provided; createLibraryRecovery provides it.');
  },
});

const replay = createAsyncLogic<ReplayOutcome, Readonly<{ operationId: string; projectId: string }>>({
  run: async () => {
    throw new Error('libraryRecovery: the replay port was not provided; createLibraryRecovery provides it.');
  },
});

const checkWorkspaces = createAsyncLogic<readonly string[], Readonly<{ rows: readonly RecoveryRowInput[] }>>({
  run: async () => {
    throw new Error('libraryRecovery: the checkWorkspaces port was not provided; createLibraryRecovery provides it.');
  },
});

const discard = createAsyncLogic<void, Readonly<{ operationId: string }>>({
  run: async () => {
    throw new Error('libraryRecovery: the discard port was not provided; createLibraryRecovery provides it.');
  },
});

/** Answer the person's replay: the row is held unless it recovered. */
const answerPerson = (
  context: Context,
  enq: Emit,
  { requestId, operationId }: Readonly<{ requestId: string | undefined; operationId: string }>,
): void => {
  if (requestId === undefined) {
    return;
  }
  const row = context.rows[operationId];
  enq.emit({ type: 'replaySettled', requestId, held: row !== undefined && isHeld(row) });
};

/** The library's journal, its replay loop and its mutation gate. Its ports throw until `createLibraryRecovery` provides them. */
export const libraryRecoveryMachine = setup({
  schemas: {
    context: types<Context>(),
    events: eventSchemas<LibraryRecoveryEvent>(),
    emitted: eventSchemas<LibraryRecoveryEmitted>(),
    transitionMeta: types<{ tla: LibraryRecoveryAction }>(),
  },
  actors: { readJournal, replay, checkWorkspaces, discard },
}).createMachine({
  id: 'library-recovery',
  version: '1',
  // A defect is recorded and the machine keeps answering: the first is kept (MC-R12, D23).
  onError: refines('Unmodelled', ({ context, event }) => ({
    context: { fault: context.fault ?? messageOf(event.error) },
  })),
  context: {
    rows: {},
    order: [],
    allowed: false,
    bootstrapFailed: false,
    replay: undefined,
    admitted: {},
    asked: [],
    personReplays: [],
    recheck: false,
    checked: {},
    discards: [],
    loadError: undefined,
    fault: undefined,
  },
  on: {
    discoveryReady: refines('Unmodelled', ({ context }) =>
      context.allowed ? {} : { context: { allowed: true, bootstrapFailed: false } },
    ),
    discoveryFailed: refines('Unmodelled', ({ context }) =>
      context.allowed ? {} : { context: { bootstrapFailed: true } },
    ),
    /* Until the journal is read the gate cannot tell, so a mutation waits; `ready` admits it. */
    mutationAsked: refines('Unmodelled', ({ context, event }, enq) => ({
      context: {
        asked: [...context.asked, { requestId: event.requestId, projectId: event.projectId }],
        ...wantDiscovery(context, enq),
      },
    })),
    /* Before the journal is read nothing is admitted: an abandoned mutation only leaves the queue. */
    mutationAbandoned: refines('Unmodelled', ({ context, event }) => ({
      context: { asked: context.asked.filter((ask) => ask.requestId !== event.requestId) },
    })),
    replayAsked: refines('Unmodelled', ({ context, event }, enq) => ({
      context: {
        personReplays: [...context.personReplays, { requestId: event.requestId, row: event.row }],
        ...wantDiscovery(context, enq),
      },
    })),
    /* Nothing is known about a row until the journal is read: a discard is refused. */
    discardAsked: refines('Unmodelled', ({ event }, enq) => {
      enq.emit({ type: 'discardSettled', requestId: event.requestId, ok: false });
      return {};
    }),
    /*
     * A row journaled before this tab's read returned (a caller that skipped the gate) is a fact: it is held from now
     * on, and its settle is taken too, so it is never left applying. Nothing is admitted until the read returns.
     */
    mutationJournaled: refines('MutationJournaled', ({ context, event }, enq) => journaled(context, event, enq)),
    mutationSettled: refines('ReplaySettled', ({ context, event }, enq) =>
      mutationSettled(context, enq, { event, admit: false }),
    ),
    /* A row this tab already knows (one journaled while the read runs) waits for its workspace in every state. */
    workspaceReturned: refines('WorkspaceReturned', ({ context, event }, enq) => ({
      context: rearm(
        context,
        context.order.filter((operationId) => {
          const row = context.rows[operationId];
          return (
            row !== undefined &&
            rearmable(row) &&
            (event.workspaceId === undefined || workspaceOf(row) === event.workspaceId)
          );
        }),
        enq,
      ),
    })),
  },
  initial: 'loading',
  states: {
    loading: {
      invoke: {
        src: 'readJournal',
        onDone: settles('Unmodelled', ({ context, event }: Done<readonly RecoveryRowInput[]>, enq) => {
          // Rows already seen (a mutation journaled while the read ran) keep their state.
          const rows = { ...context.rows };
          const order = [...context.order];
          for (const input of event.output) {
            if (rows[input.operationId] === undefined) {
              rows[input.operationId] = { ...input, status: 'waiting', attempts: 0, via: 'journal' };
              order.push(input.operationId);
            }
          }
          const loaded = { ...context, rows, order, loadError: undefined };
          const patch = changed(context, { rows, order, loadError: undefined, ...admitWaiting(loaded, enq) }, enq);
          // After the rows are announced, so a question that starts on `journalReady` already sees them held.
          enq.emit({ type: 'journalReady', pending: event.output.length });
          return { target: 'ready', context: patch };
        }),
        onError: settles('Unmodelled', ({ event }: Failed, enq) => {
          const message = messageOf(event.error);
          enq.emit({ type: 'journalFailed', message });
          return { target: 'loadFailed', context: { loadError: message } };
        }),
      },
    },
    loadFailed: {
      on: {
        load: refines('Unmodelled', () => ({ target: 'loading' })),
        /* As today's `ensureJournalReady`, which drops a failed read: the next caller that needs the journal reads it again. */
        mutationAsked: refines('Unmodelled', ({ context, event }, enq) => ({
          target: 'loading',
          context: {
            asked: [...context.asked, { requestId: event.requestId, projectId: event.projectId }],
            ...wantDiscovery(context, enq),
          },
        })),
        replayAsked: refines('Unmodelled', ({ context, event }, enq) => ({
          target: 'loading',
          context: {
            personReplays: [...context.personReplays, { requestId: event.requestId, row: event.row }],
            ...wantDiscovery(context, enq),
          },
        })),
      },
    },
    ready: {
      on: {
        mutationAsked: refines('Unmodelled', ({ context, event }, enq) => {
          if (gated(context, event.projectId)) {
            return {
              context: {
                asked: [...context.asked, { requestId: event.requestId, projectId: event.projectId }],
                ...wantDiscovery(context, enq),
              },
            };
          }
          enq.emit({ type: 'mutationAdmitted', requestId: event.requestId });
          return {
            context: {
              admitted: { ...context.admitted, [event.requestId]: event.projectId },
              ...wantDiscovery(context, enq),
            },
          };
        }),
        mutationAbandoned: refines('Unmodelled', ({ context, event }, enq) => {
          const { [event.requestId]: _gone, ...admitted } = context.admitted;
          const released = {
            ...context,
            admitted,
            asked: context.asked.filter((ask) => ask.requestId !== event.requestId),
          };
          return { context: { admitted, asked: released.asked, ...admitWaiting(released, enq) } };
        }),
        // `ReplaySettled` of a mutation's own row, which the model labels `MutationApplied`.
        mutationSettled: refines('ReplaySettled', ({ context, event }, enq) =>
          mutationSettled(context, enq, { event, admit: true }),
        ),
        replayAsked: refines('Unmodelled', ({ context, event }, enq) => ({
          context: {
            personReplays: [...context.personReplays, { requestId: event.requestId, row: event.row }],
            ...wantDiscovery(context, enq),
          },
        })),
      },
      type: 'parallel',
      states: {
        loop: {
          initial: 'idle',
          states: {
            idle: {
              always: refines('ReplayStarted', ({ context }, enq) => {
                const next = nextReplay(context);
                if (next === undefined) {
                  return undefined;
                }
                const row = next.context.rows[next.operationId];
                if (row === undefined) {
                  return undefined;
                }
                // `settleRecovery`: a terminal row, or one with its third attempt made, is not replayed again.
                if (
                  row.status === 'recovered' ||
                  row.status === 'discarded' ||
                  row.status === 'replaying' ||
                  row.attempts >= maxRecoveryAttempts ||
                  (row.status === 'failed' && (row.discarding || terminalRecoveryReasons.has(row.reason)))
                ) {
                  answerPerson(next.context, enq, next);
                  // The person's replay no longer holds its project.
                  return {
                    context: {
                      personReplays: next.context.personReplays,
                      rows: next.context.rows,
                      order: next.context.order,
                      ...admitWaiting(next.context, enq),
                    },
                  };
                }
                const {
                  reason: _reason,
                  discarding: _discarding,
                  ...rest
                } = row as RowBase & Partial<Pick<Extract<RecoveryRow, { status: 'failed' }>, 'reason' | 'discarding'>>;
                const started: RecoveryRow = {
                  ...rest,
                  status: 'replaying',
                  attempts: row.attempts + 1,
                  via: next.requestId === undefined ? 'journal' : 'person',
                };
                enq.emit({ type: 'rowStarted', operationId: row.operationId, projectId: row.projectId });
                return {
                  target: 'replaying',
                  context: changed(
                    context,
                    {
                      rows: { ...next.context.rows, [row.operationId]: started },
                      order: next.context.order,
                      personReplays: next.context.personReplays,
                      replay: { operationId: row.operationId, requestId: next.requestId },
                    },
                    enq,
                  ),
                };
              }),
            },
            replaying: {
              invoke: {
                src: 'replay',
                input: ({ context }) => ({
                  operationId: context.replay?.operationId ?? '',
                  projectId:
                    context.replay === undefined ? '' : (context.rows[context.replay.operationId]?.projectId ?? ''),
                }),
                onDone: settles('ReplaySettled', ({ context, event }: Done<ReplayOutcome>, enq) =>
                  loopSettled(context, event.output, enq),
                ),
                // `settleRecovery`'s catch: a replay that threw failed with `filesystem-error`.
                onError: settles('ReplaySettled', ({ context }: Failed, enq) =>
                  loopSettled(context, { status: 'failed', reason: 'filesystem-error' }, enq),
                ),
              },
            },
          },
        },
        retry: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                retryRequested: refines('Unmodelled', ({ context }) =>
                  Object.values(context.rows).some((row) => rearmable(row))
                    ? { target: 'checking', context: { checked: checkedOf(context) } }
                    : {},
                ),
              },
            },
            /** Rule 6, the named change: which of these rows' workspaces are present. */
            checking: {
              invoke: {
                src: 'checkWorkspaces',
                input: ({ context }) => ({
                  rows: context.order.flatMap((operationId) => {
                    const row = context.rows[operationId];
                    if (row === undefined || !rearmable(row)) {
                      return [];
                    }
                    const { operationId: id, projectId, kind, storage } = row;
                    const workspaceId = workspaceOf(row);
                    return [
                      {
                        operationId: id,
                        projectId,
                        kind,
                        storage,
                        ...(workspaceId === undefined ? {} : { workspaceId }),
                      },
                    ];
                  }),
                }),
                onDone: settles('WorkspaceReturned', ({ context, event }: Done<readonly string[]>, enq) => {
                  // Only rows unchanged since the check began: one replayed meanwhile failed on newer information.
                  const present = event.output.filter(
                    (operationId) => context.rows[operationId]?.attempts === context.checked[operationId],
                  );
                  const patch = rearm(context, present, enq);
                  return {
                    target: context.recheck ? 'checking' : 'idle',
                    reenter: true,
                    context: { ...patch, recheck: false, checked: checkedOf({ ...context, ...patch }) },
                  };
                }),
                // A failed check re-arms nothing: the row waits for its workspace as before.
                onError: settles('Unmodelled', ({ context }: Failed) => ({
                  target: context.recheck ? 'checking' : 'idle',
                  reenter: true,
                  context: { recheck: false, checked: checkedOf(context) },
                })),
              },
              on: {
                retryRequested: refines('Unmodelled', () => ({ context: { recheck: true } })),
              },
            },
          },
        },
        discard: {
          initial: 'idle',
          states: {
            idle: {
              always: refines('Unmodelled', ({ context }, enq) => {
                const [next] = context.discards;
                if (next === undefined) {
                  return undefined;
                }
                const row = context.rows[next.operationId];
                // Only a failed row is the person's to discard (rule 5).
                if (row?.status !== 'failed' || row.discarding) {
                  enq.emit({ type: 'discardSettled', requestId: next.requestId, ok: false });
                  return { context: { discards: context.discards.slice(1) } };
                }
                return {
                  target: 'discarding',
                  context: { rows: { ...context.rows, [row.operationId]: { ...row, discarding: true } } },
                };
              }),
              on: {
                discardAsked: refines('Unmodelled', ({ context, event }) => ({
                  context: {
                    discards: [...context.discards, { requestId: event.requestId, operationId: event.operationId }],
                  },
                })),
              },
            },
            discarding: {
              invoke: {
                src: 'discard',
                input: ({ context }) => ({ operationId: context.discards[0]?.operationId ?? '' }),
                onDone: settles('PersonDiscarded', ({ context }: Done<void>, enq) => {
                  const [done, ...discards] = context.discards;
                  const row = done === undefined ? undefined : context.rows[done.operationId];
                  if (done === undefined || row === undefined) {
                    return { target: 'idle', context: { discards } };
                  }
                  enq.emit({ type: 'discardSettled', requestId: done.requestId, ok: true });
                  enq.emit({ type: 'rowSettled', operationId: row.operationId, projectId: row.projectId });
                  const {
                    reason: _reason,
                    discarding: _discarding,
                    ...rest
                  } = row as RowBase &
                    Partial<Pick<Extract<RecoveryRow, { status: 'failed' }>, 'reason' | 'discarding'>>;
                  return {
                    target: 'idle',
                    context: changed(
                      context,
                      { discards, rows: { ...context.rows, [row.operationId]: { ...rest, status: 'discarded' } } },
                      enq,
                    ),
                  };
                }),
                onError: settles('Unmodelled', ({ context }: Failed, enq) => {
                  const [done, ...discards] = context.discards;
                  const row = done === undefined ? undefined : context.rows[done.operationId];
                  if (done !== undefined) {
                    enq.emit({ type: 'discardSettled', requestId: done.requestId, ok: false });
                  }
                  return {
                    target: 'idle',
                    context:
                      row?.status === 'failed'
                        ? { discards, rows: { ...context.rows, [row.operationId]: { ...row, discarding: false } } }
                        : { discards },
                  };
                }),
              },
              on: {
                discardAsked: refines('Unmodelled', ({ context, event }) => ({
                  context: {
                    discards: [...context.discards, { requestId: event.requestId, operationId: event.operationId }],
                  },
                })),
              },
            },
          },
        },
      },
    },
  },
});

/** A mutation journaled its row: the admission becomes a row this tab holds, replaying by the mutation (rule 5). */
function journaled(
  context: Context,
  event: Extract<LibraryRecoveryEvent, { type: 'mutationJournaled' }>,
  enq: Emit,
): { context: Patch } {
  const { [event.requestId]: _admission, ...admitted } = context.admitted;
  // A caller that journaled without waiting for its admission is no longer asking.
  const asked = context.asked.filter((ask) => ask.requestId !== event.requestId);
  const known = context.rows[event.row.operationId] !== undefined;
  enq.emit({ type: 'rowStarted', operationId: event.row.operationId, projectId: event.row.projectId });
  return {
    context: changed(
      context,
      {
        admitted,
        asked,
        rows: {
          ...context.rows,
          [event.row.operationId]: { ...event.row, status: 'replaying', attempts: 0, via: 'mutation' },
        },
        order: known ? context.order : [...context.order, event.row.operationId],
      },
      enq,
    ),
  };
}

/** The loop's replay settled; it answers the person's replay it ran, and the loop moves on. */
function loopSettled(context: Context, outcome: ReplayOutcome, enq: Emit): { target: string; context: Patch } {
  const { replay: current } = context;
  const row = current === undefined ? undefined : context.rows[current.operationId];
  if (current === undefined || row === undefined) {
    return { target: 'idle', context: { replay: undefined } };
  }
  const patch = settleRow(context, enq, { row, outcome });
  answerPerson({ ...context, ...patch }, enq, current);
  return { target: 'idle', context: { ...patch, replay: undefined } };
}

export type LibraryRecoveryActor = Actor<typeof libraryRecoveryMachine>;
export type LibraryRecoverySnapshot = SnapshotFrom<typeof libraryRecoveryMachine>;

/* Readers for the service and React (MC-R25). */

/** The rows this tab holds, as the library shows them. */
export const selectRecoveries = (snapshot: LibraryRecoverySnapshot): PendingProjectRecovery[] =>
  recoveriesOf(snapshot.context);

/** Rule 4: whether a mutation on `projectId` would wait. */
export const selectMutationGated = (snapshot: LibraryRecoverySnapshot, projectId: string): boolean =>
  gated(snapshot.context, projectId);

/** "Recovering" per project: a waiting or replaying row holds it. */
export const selectProjectRecovering = (snapshot: LibraryRecoverySnapshot, projectId: string): boolean =>
  Object.values(snapshot.context.rows).some((row) => row.projectId === projectId && isActive(row));

/** The journal has been read. */
export const selectJournalReady = (snapshot: LibraryRecoverySnapshot): boolean =>
  !snapshot.matches('loading') && !snapshot.matches('loadFailed');

/** The ports of the journal. Each is a storage call. */
export type LibraryRecoveryPorts = Readonly<{
  /** The journal's rows, in stored order (`getPendingProjectOperations`). */
  readJournal: (signal: AbortSignal) => Promise<readonly RecoveryRowInput[]>;
  /** Replay one row (`resumePendingProjectOperation` and the chat placement). A rejection is `filesystem-error`. */
  replay: (input: Readonly<{ operationId: string; projectId: string; signal: AbortSignal }>) => Promise<ReplayOutcome>;
  /** The operation ids among `rows` whose workspace is present; a lapsed permission with its handle counts as present. */
  checkWorkspaces: (
    input: Readonly<{ rows: readonly RecoveryRowInput[]; signal: AbortSignal }>,
  ) => Promise<readonly string[]>;
  /** Delete one journal row (`completePendingProjectOperation`). */
  discard: (input: Readonly<{ operationId: string; signal: AbortSignal }>) => Promise<void>;
}>;

/**
 * An unstarted recovery actor over its ports (MC-R4). Starting it reads the journal.
 *
 * @param input - The ports, and the actor options tests inject.
 * @returns The actor; start it once.
 */
export const createLibraryRecovery = (
  input: Readonly<{ ports: LibraryRecoveryPorts }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): LibraryRecoveryActor => {
  const { ports, clock, inspect, onRejectedEvent } = input;
  const machine = libraryRecoveryMachine.provide({
    actors: {
      readJournal: createAsyncLogic<readonly RecoveryRowInput[]>({
        run: async ({ signal }) => ports.readJournal(signal),
      }),
      replay: createAsyncLogic<ReplayOutcome, Readonly<{ operationId: string; projectId: string }>>({
        run: async ({ input: row, signal }) => ports.replay({ ...row, signal }),
      }),
      checkWorkspaces: createAsyncLogic<readonly string[], Readonly<{ rows: readonly RecoveryRowInput[] }>>({
        run: async ({ input: { rows }, signal }) => ports.checkWorkspaces({ rows, signal }),
      }),
      discard: createAsyncLogic<void, Readonly<{ operationId: string }>>({
        run: async ({ input: { operationId }, signal }) => ports.discard({ operationId, signal }),
      }),
    },
  });
  return createActor(machine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  });
};
