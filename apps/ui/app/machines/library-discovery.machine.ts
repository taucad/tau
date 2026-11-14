/**
 * `libraryDiscovery`: one tab's discovery passes over the project roots, and the epoch every listing is stamped with
 * (app state orchestration charter D2, D3, D4, D10, D13, D23; invariants I7, I9; plan § 4 A3a; inventory L1, L2, L5).
 *
 * The protocol is `apps/ui/specs/library-catalog/LibraryCatalog.tla`. This machine keeps its README's rules 1 to 3:
 *
 * 1. Starting a pass and every invalidation move the epoch. A pass applies its listing in the same transition that
 *    compares the pass's epoch with the current one, and drops it otherwise. Its writes are fenced the same way: the
 *    write port starts in the transition that checked the epoch and the stop, so nothing yields between the check and
 *    the write (I7).
 * 2. Every invalidation owes a pass. A pass that an invalidation overtook is dropped and a fresh one starts, so its
 *    requesters are answered only with a listing whose epoch is current.
 * 3. A write stop is remembered (DF20). A pass that reaches a write while the stop is in force publishes what it read,
 *    skips its writes and records `skipped`. When the stop ends after one, the machine invalidates and starts a fresh
 *    pass, and reports the catalog current only once nothing is owed or in flight (I9).
 *
 * A pass has three steps, each a port: `scan` reads the roots and classifies the manifests it finds (today
 * `listProjectManifests`, the route configs and the quarantine filter); `plan` decides the route-config upserts and
 * the orphan deletes, readying the worker as it needs; `apply` writes them and syncs the roots. The machine checks the
 * epoch and the stop after `scan` and after `plan`, and starts `apply` only in the transition that passed both.
 *
 * `passRequested{requestId, reuse}` is answered with `passSettled{requestId, epoch, result}`, or `passFailed` when a
 * port rejected. Requests join the pass in flight (single flight). With `reuse`, a request is answered at once from
 * the last listing when its epoch is still current, as the cache at `use-project-manager.tsx` line 2495 does today.
 * `poll` starts a pass when none is in flight: an explicit refresh.
 *
 * An owed pass starts when someone asks for one, as today: an invalidation refetches the active `projects` query
 * (`invalidateQueries`), and that refetch runs the pass. The listing query is the requester; it asks with
 * `passRequested{reuse: true}` when it hears `epochMoved{current: false}` (A3b). The one pass the machine starts by
 * itself is the redo after a write stop (rule 3). Nothing here is timed: today's listing has no refetch interval
 * (`use-projects.test.ts` pins its absence), so the machine declares no `after`.
 *
 * Two observations are children: the manifest watch (`discoveryObservation`) and the chat-metadata watch
 * (`metadataObservation`). Each is a callback actor that holds its subscription in its closure (D4); a composition
 * root provides them. They report with `invalidated` and `observationChanged`.
 *
 * Context holds the epoch, what is owed and the last listing, which is rebuilt by the next pass; nothing here survives
 * a reload (MC-R5). Nothing in the app runs this machine yet: A3b wires it.
 *
 * @module
 */
import { createActor, createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, SnapshotFrom, StateValue } from 'xstate';
import type { ProjectDiscoveryResult } from '@taucad/filesystem';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';

/** The `LibraryCatalog.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. */
export type LibraryDiscoveryAction =
  | 'PassStarted'
  | 'PassSettled'
  | 'EpochBumped'
  | 'WriteStopBegan'
  | 'WriteStopEnded'
  | 'Unmodelled';

/** The route-config writes one pass decided. */
export type DiscoveryWrites = Readonly<{
  /** Route configs to write, as `ProjectFileSystemConfig` rows. */
  upserts: readonly unknown[];
  /** Project ids whose route config and resources go. */
  deletes: readonly string[];
}>;

/** What the `plan` port answers: the listing with its route-blocked marks, and the writes it would make. */
export type DiscoveryPlan = Readonly<{ result: ProjectDiscoveryResult; writes: DiscoveryWrites }>;

/** The last listing a current pass published, with the epoch it was taken at. */
export type DiscoverySnapshot = Readonly<{ epoch: number; result: ProjectDiscoveryResult }>;

/** Which observation a health report is about. */
export type DiscoveryObservation = 'discovery' | 'metadata';

/** State owned by one `libraryDiscovery` actor. */
export type LibraryDiscoveryContext = Readonly<{
  /** Moves on every pass start and every invalidation. */
  epoch: number;
  /** The epoch the pass in flight started at; `undefined` while idle. */
  passEpoch: number | undefined;
  /** An invalidation or a failed pass owes a pass. */
  owed: boolean;
  /** The write stop ended after a skipped pass: a fresh pass is owed without a requester. */
  redo: boolean;
  /** A pass skipped its writes during the current stop. */
  skipped: boolean;
  /** The listing of the last pass that settled at a current epoch; dropped by an invalidation. */
  snapshot: DiscoverySnapshot | undefined;
  /** What the pass in flight read, between its steps. */
  read: ProjectDiscoveryResult | undefined;
  /** The writes the pass in flight is making. */
  writes: DiscoveryWrites | undefined;
  /** Requests waiting for a current pass. */
  waiters: readonly string[];
  /** The last error each observation reported; absent when healthy. */
  observationErrors: Readonly<Partial<Record<DiscoveryObservation, string>>>;
  /** The first defect the root `onError` caught (MC-R12, D23). */
  fault: string | undefined;
}>;

/** Events a `libraryDiscovery` actor takes. */
export type LibraryDiscoveryEvent =
  /** A listing is needed. `reuse` accepts the last listing while its epoch is current. */
  | { type: 'passRequested'; requestId: string; reuse: boolean }
  /** Start a pass now unless one is in flight: the poll, an explicit refresh. */
  | { type: 'poll' }
  /** Storage changed under the listing: a replay settled, a row was discarded, a root moved, the workspace changed. */
  | { type: 'invalidated' }
  /** A newer build announced itself: durable writes stop (DF20). */
  | { type: 'writeStopBegan' }
  /** This build is live again. */
  | { type: 'writeStopEnded' }
  /** An observation's health changed; `error` is absent when it is healthy. */
  | { type: 'observationChanged'; observation: DiscoveryObservation; error?: string }
  /** Ask the observations to read again: one project's chat metadata, or every watch. */
  | { type: 'refreshObservations'; resourceId?: string };

/** Events a `libraryDiscovery` actor emits. */
export type LibraryDiscoveryEmitted =
  | { type: 'passSettled'; requestId: string; epoch: number; result: ProjectDiscoveryResult }
  | { type: 'passFailed'; requestId: string; epoch: number; message: string }
  /** The epoch moved, or the last listing stopped or started being current: the fence inputs of route access. */
  | { type: 'epochMoved'; epoch: number; current: boolean };

/** The public alphabet (MC-R17). */
export const libraryDiscoveryEventTypes = [
  'passRequested',
  'poll',
  'invalidated',
  'writeStopBegan',
  'writeStopEnded',
  'observationChanged',
  'refreshObservations',
] as const satisfies ReadonlyArray<LibraryDiscoveryEvent['type']>;

/**
 * Pairs a state takes without a transition (MC-R17). A stop that is already in force, or already lifted, is the same
 * fact delivered twice.
 */
export const libraryDiscoveryIgnoredEvents = [
  ['stop.running', 'writeStopEnded'],
  ['stop.stopped', 'writeStopBegan'],
] as const satisfies ReadonlyArray<readonly [state: string, eventType: string]>;

type Context = LibraryDiscoveryContext;
type Patch = { -readonly [K in keyof Context]?: Context[K] };
type Emit = { emit: (event: LibraryDiscoveryEmitted) => void };
type Step = { target?: string; context?: Patch; reenter?: boolean };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 *
 * @param tla - The `LibraryCatalog.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: LibraryDiscoveryAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/** An invoke's answer, typed by hand: alpha.59 cannot type a `{ to, meta }` `onDone`'s arguments. */
type Done<Output> = Readonly<{ context: Context; event: Readonly<{ output: Output }>; value: StateValue }>;
type Failed = Readonly<{ context: Context; event: Readonly<{ error: unknown }> }>;

type Settles = <Args>(tla: LibraryDiscoveryAction, to: (args: Args, enq: Emit) => Step) => never;
/**
 * An invoke's `onDone` or `onError` as `{ to, meta }` (MC-R27), with its arguments typed by hand.
 *
 * @param tla - The `LibraryCatalog.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, as whatever the config expects.
 */
// oxlint-disable-next-line typescript/consistent-type-assertions -- see `refines`.
const settles = ((tla: LibraryDiscoveryAction, to: unknown) => ({ meta: { tla }, to })) as unknown as Settles;

const isCurrent = (context: Context): boolean => context.snapshot?.epoch === context.epoch;

/** Tell the route-access fence where the epoch and the listing stand, when either moved. */
const announce = (before: Context, patch: Patch, enq: Emit): Patch => {
  const after = { ...before, ...patch };
  if (after.epoch !== before.epoch || isCurrent(after) !== isCurrent(before)) {
    enq.emit({ type: 'epochMoved', epoch: after.epoch, current: isCurrent(after) });
  }
  return patch;
};

/** A pass starts: the epoch moves (rule 1), and what was owed is now in flight. */
const startPass = (context: Context, enq: Emit): Step => {
  const epoch = context.epoch + 1;
  return {
    target: '#library-discovery.pass.passing',
    reenter: true,
    context: announce(
      context,
      {
        epoch,
        passEpoch: epoch,
        owed: false,
        redo: false,
        read: undefined,
        writes: undefined,
        waiters: context.waiters,
      },
      enq,
    ),
  };
};

/** An invalidation: the epoch moves, the last listing is no longer current, and a pass is owed (rule 2). */
const invalidate = (context: Context, enq: Emit): Patch =>
  announce(context, { epoch: context.epoch + 1, owed: true, snapshot: undefined }, enq);

/** The pass settled at the current epoch: its listing is published and every requester is answered with it. */
const publish = (
  context: Context,
  enq: Emit,
  { result, skipped }: Readonly<{ result: ProjectDiscoveryResult; skipped: boolean }>,
): Step => {
  const { epoch } = context;
  for (const requestId of context.waiters) {
    enq.emit({ type: 'passSettled', requestId, epoch, result });
  }
  return {
    target: '#library-discovery.pass.idle',
    context: announce(
      context,
      {
        snapshot: { epoch, result },
        passEpoch: undefined,
        read: undefined,
        writes: undefined,
        waiters: [],
        skipped: context.skipped || skipped,
      },
      enq,
    ),
  };
};

/** The pass in flight is stale: an invalidation overtook it, so its listing is dropped and a fresh pass starts. */
const isStale = (context: Context): boolean => context.passEpoch !== context.epoch;

/**
 * The last step of a pass ends. Stale: drop it and start again for its requesters. Stopped: publish what it read and
 * record that its writes were skipped.
 */
const afterRead = (
  context: Context,
  enq: Emit,
  { result, stopped }: Readonly<{ result: ProjectDiscoveryResult; stopped: boolean }>,
): Step | undefined => {
  if (isStale(context)) {
    return startPass(context, enq);
  }
  if (stopped) {
    return publish(context, enq, { result, skipped: true });
  }
  return undefined;
};

const scan = createAsyncLogic<ProjectDiscoveryResult, { epoch: number }>({
  run: async () => {
    throw new Error('libraryDiscovery: the scan port was not provided; createLibraryDiscovery provides it.');
  },
});

const plan = createAsyncLogic<DiscoveryPlan, { epoch: number; result: ProjectDiscoveryResult }>({
  run: async () => {
    throw new Error('libraryDiscovery: the plan port was not provided; createLibraryDiscovery provides it.');
  },
});

const apply = createAsyncLogic<void, { epoch: number; writes: DiscoveryWrites }>({
  run: async () => {
    throw new Error('libraryDiscovery: the apply port was not provided; createLibraryDiscovery provides it.');
  },
});

/** A callback driver may default to a no-op (MC-R8): no watch is a library that is never told of a change. */
const discoveryObservation = createCallbackLogic<LibraryDiscoveryEvent>(() => undefined);
const metadataObservation = createCallbackLogic<LibraryDiscoveryEvent>(() => undefined);

/** The library's discovery passes. Its ports throw until `createLibraryDiscovery` provides them. */
export const libraryDiscoveryMachine = setup({
  schemas: {
    context: types<Context>(),
    events: eventSchemas<LibraryDiscoveryEvent>(),
    emitted: eventSchemas<LibraryDiscoveryEmitted>(),
    transitionMeta: types<{ tla: LibraryDiscoveryAction }>(),
  },
  actors: { scan, plan, apply, discoveryObservation, metadataObservation },
}).createMachine({
  id: 'library-discovery',
  version: '1',
  // A defect is recorded and the machine keeps answering: the first is kept, since later ones are usually its
  // consequences (MC-R12, D23).
  onError: refines('Unmodelled', ({ context, event }) => ({
    context: { fault: context.fault ?? messageOf(event.error) },
  })),
  context: {
    epoch: 0,
    passEpoch: undefined,
    // A tab starts with no listing: the first pass is owed (Init).
    owed: true,
    redo: false,
    skipped: false,
    snapshot: undefined,
    read: undefined,
    writes: undefined,
    waiters: [],
    observationErrors: {},
    fault: undefined,
  },
  invoke: [
    {
      id: 'discoveryObservation',
      src: 'discoveryObservation',
      onError: refines('Unmodelled', ({ context, event }) => ({
        context: { fault: context.fault ?? messageOf(event.error) },
      })),
    },
    {
      id: 'metadataObservation',
      src: 'metadataObservation',
      onError: refines('Unmodelled', ({ context, event }) => ({
        context: { fault: context.fault ?? messageOf(event.error) },
      })),
    },
  ],
  on: {
    invalidated: refines('EpochBumped', ({ context }, enq) => ({ context: invalidate(context, enq) })),
    observationChanged: refines('Unmodelled', ({ context, event }) => {
      const { [event.observation]: _previous, ...rest } = context.observationErrors;
      return {
        context: {
          observationErrors: event.error === undefined ? rest : { ...rest, [event.observation]: event.error },
        },
      };
    }),
    refreshObservations: refines('Unmodelled', ({ children, event }, enq) => {
      for (const child of [children['discoveryObservation'], children['metadataObservation']]) {
        if (child !== undefined) {
          enq.sendTo(child, event);
        }
      }
      return {};
    }),
  },
  type: 'parallel',
  states: {
    pass: {
      initial: 'idle',
      states: {
        idle: {
          // A requester waits, or the stop ended after a skipped pass: the owed pass starts.
          always: refines('PassStarted', ({ context }, enq) =>
            context.owed && (context.waiters.length > 0 || context.redo) ? startPass(context, enq) : undefined,
          ),
          on: {
            passRequested: refines('PassStarted', ({ context, event }, enq) => {
              if (event.reuse && isCurrent(context) && context.snapshot !== undefined) {
                enq.emit({
                  type: 'passSettled',
                  requestId: event.requestId,
                  epoch: context.snapshot.epoch,
                  result: context.snapshot.result,
                });
                return {};
              }
              return startPass({ ...context, waiters: [...context.waiters, event.requestId] }, enq);
            }),
            poll: refines('PassStarted', ({ context }, enq) => startPass(context, enq)),
          },
        },
        /** The scan: what the roots hold, at `passEpoch`. */
        passing: {
          invoke: {
            src: 'scan',
            input: ({ context }) => ({ epoch: context.passEpoch ?? context.epoch }),
            onDone: settles('PassSettled', ({ context, event, value }: Done<ProjectDiscoveryResult>, enq) => {
              const stopped = (value as { stop?: string }).stop === 'stopped';
              return (
                afterRead(context, enq, { result: event.output, stopped }) ?? {
                  target: 'reconciling',
                  context: { read: event.output },
                }
              );
            }),
            onError: settles('PassSettled', ({ context, event }: Failed, enq) => failed(context, event.error, enq)),
          },
          on: {
            passRequested: refines('Unmodelled', ({ context, event }) => ({
              context: { waiters: [...context.waiters, event.requestId] },
            })),
            /* Single flight: the pass in flight serves the poll. */
            poll: refines('Unmodelled', () => ({})),
          },
        },
        reconciling: {
          initial: 'planning',
          on: {
            passRequested: refines('Unmodelled', ({ context, event }) => ({
              context: { waiters: [...context.waiters, event.requestId] },
            })),
            /* Single flight: the pass in flight serves the poll. */
            poll: refines('Unmodelled', () => ({})),
          },
          states: {
            /** Which route configs to write and which orphans to delete. */
            planning: {
              invoke: {
                src: 'plan',
                input: ({ context }) => ({
                  epoch: context.passEpoch ?? context.epoch,
                  result: context.read ?? { entries: [], roots: [] },
                }),
                onDone: settles('PassSettled', ({ context, event, value }: Done<DiscoveryPlan>, enq) => {
                  const stopped = (value as { stop?: string }).stop === 'stopped';
                  const { result, writes } = event.output;
                  const empty = writes.upserts.length === 0 && writes.deletes.length === 0;
                  return (
                    afterRead(context, enq, { result, stopped: stopped && !empty }) ??
                    (empty
                      ? publish(context, enq, { result, skipped: false })
                      : // Rule 1: the write starts in the transition that checked the epoch and the stop.
                        { target: 'writing', context: { read: result, writes } })
                  );
                }),
                onError: settles('PassSettled', ({ context, event }: Failed, enq) => failed(context, event.error, enq)),
              },
            },
            /** The writes; once started they are not interrupted. */
            writing: {
              invoke: {
                src: 'apply',
                input: ({ context }) => ({
                  epoch: context.passEpoch ?? context.epoch,
                  writes: context.writes ?? { upserts: [], deletes: [] },
                }),
                onDone: settles('PassSettled', ({ context }: Done<void>, enq) =>
                  isStale(context)
                    ? startPass(context, enq)
                    : publish(context, enq, { result: context.read ?? { entries: [], roots: [] }, skipped: false }),
                ),
                onError: settles('PassSettled', ({ context, event }: Failed, enq) => failed(context, event.error, enq)),
              },
            },
          },
        },
      },
    },
    stop: {
      initial: 'running',
      states: {
        running: {
          on: {
            writeStopBegan: refines('WriteStopBegan', () => ({ target: 'stopped' })),
          },
        },
        stopped: {
          on: {
            // Rule 3: a stop that skipped a pass owes a fresh one, which starts without a requester.
            writeStopEnded: refines('WriteStopEnded', ({ context }, enq) =>
              context.skipped
                ? { target: 'running', context: { ...invalidate(context, enq), skipped: false, redo: true } }
                : { target: 'running' },
            ),
          },
        },
      },
    },
  },
});

/**
 * A port rejected. A stale pass starts again; otherwise its requesters learn why, and a pass stays owed so the
 * catalog is never reported current on a failed read.
 */
function failed(context: Context, error: unknown, enq: Emit): Step {
  if (isStale(context)) {
    return startPass(context, enq);
  }
  const message = messageOf(error);
  for (const requestId of context.waiters) {
    enq.emit({ type: 'passFailed', requestId, epoch: context.epoch, message });
  }
  return {
    target: '#library-discovery.pass.idle',
    context: { passEpoch: undefined, read: undefined, writes: undefined, waiters: [], owed: true },
  };
}

export type LibraryDiscoveryActor = Actor<typeof libraryDiscoveryMachine>;
export type LibraryDiscoverySnapshot = SnapshotFrom<typeof libraryDiscoveryMachine>;

/* Readers for the service and React (MC-R25). */

/** The current epoch. */
export const selectDiscoveryEpoch = (snapshot: LibraryDiscoverySnapshot): number => snapshot.context.epoch;

/** The last listing while its epoch is current. */
export const selectCurrentListing = (snapshot: LibraryDiscoverySnapshot): ProjectDiscoveryResult | undefined =>
  snapshot.context.snapshot?.epoch === snapshot.context.epoch ? snapshot.context.snapshot.result : undefined;

/**
 * Whether a listing settled at `epoch` may still be published: the fence for work the service does after a pass (today
 * `prepareCurrentWorkspaceCatalog` enriches the listing before it reaches the catalog). Checked in the same task as the
 * publish, as rule 1 asks.
 */
export const selectEpochCurrent = (snapshot: LibraryDiscoverySnapshot, epoch: number): boolean =>
  snapshot.context.epoch === epoch;

/** I9: the catalog is reported current only with no pass in flight or owed and no pass skipped in this stop. */
export const selectCatalogCurrent = (snapshot: LibraryDiscoverySnapshot): boolean =>
  snapshot.matches({ pass: 'idle' }) && !snapshot.context.owed && !snapshot.context.skipped;

/** The pass in flight, if any. */
export const selectPassInFlight = (snapshot: LibraryDiscoverySnapshot): boolean => !snapshot.matches({ pass: 'idle' });

/** The ports of a discovery pass. Each is a storage call; a rejection fails the pass. */
export type LibraryDiscoveryPorts = Readonly<{
  scan: (input: Readonly<{ epoch: number; signal: AbortSignal }>) => Promise<ProjectDiscoveryResult>;
  plan: (
    input: Readonly<{ epoch: number; result: ProjectDiscoveryResult; signal: AbortSignal }>,
  ) => Promise<DiscoveryPlan>;
  apply: (input: Readonly<{ epoch: number; writes: DiscoveryWrites; signal: AbortSignal }>) => Promise<void>;
  /** The manifest watch; it sends `invalidated` and `observationChanged`. Absent: no watch. */
  discoveryObservation?: typeof discoveryObservation;
  /** The chat-metadata watch; it sends `observationChanged` and takes `refreshObservations`. Absent: no watch. */
  metadataObservation?: typeof metadataObservation;
}>;

/**
 * An unstarted discovery actor over its ports (MC-R4).
 *
 * @param input - The ports, and the actor options tests inject.
 * @returns The actor; start it once.
 */
export const createLibraryDiscovery = (
  input: Readonly<{ ports: LibraryDiscoveryPorts }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): LibraryDiscoveryActor => {
  const { ports, clock, inspect, onRejectedEvent } = input;
  const machine = libraryDiscoveryMachine.provide({
    actors: {
      scan: createAsyncLogic<ProjectDiscoveryResult, { epoch: number }>({
        run: async ({ input: { epoch }, signal }) => ports.scan({ epoch, signal }),
      }),
      plan: createAsyncLogic<DiscoveryPlan, { epoch: number; result: ProjectDiscoveryResult }>({
        run: async ({ input: { epoch, result }, signal }) => ports.plan({ epoch, result, signal }),
      }),
      apply: createAsyncLogic<void, { epoch: number; writes: DiscoveryWrites }>({
        run: async ({ input: { epoch, writes }, signal }) => ports.apply({ epoch, writes, signal }),
      }),
      discoveryObservation: ports.discoveryObservation ?? discoveryObservation,
      metadataObservation: ports.metadataObservation ?? metadataObservation,
    },
  });
  // An explicit `undefined` would replace xstate's own default, so only what was given is passed on.
  return createActor(machine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  });
};
