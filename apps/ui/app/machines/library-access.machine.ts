/**
 * `libraryAccess`: the library's answer to a route's question "may this project open, and as what?" (app state
 * orchestration charter D2, D3, D4, D10, D13, D23; invariants I4, I17, I18; plan § 4 A3a; inventory L8).
 *
 * Route access is not a function of state. Today's `getProjectRouteAccess` (`use-project-manager.tsx` lines 2419 to
 * 2545) awaits up to three storage reads and a discovery pass, and starts over when the discovery epoch moved under
 * one. This machine ports it step for step, one query child per request id, and keeps the
 * `apps/ui/specs/library-catalog/LibraryCatalog.tla` README's rules 8 and 9:
 *
 * 8. **Every answer is fenced.** At the top of each turn a held row answers at once: `recovering` while this tab
 *    holds a waiting or replaying row for the project, `recovery-failed` for a failed one. Otherwise each read records
 *    the epoch it observed (for a discovery pass, the pass's own epoch). After the last read the answer is delivered
 *    only if the epoch has not moved since, no recovery row for the project started since the turn's first read, and
 *    none is held; otherwise the query reads again from the top. This holds for every answer, `missing` and
 *    `unavailable` included, which is the `today-access-loop` defect fixed here: today only the found path checks the
 *    recovery set.
 * 9. **Answers are matched by id and generation.** Asking again under an id, or cancelling it, stops its query and
 *    moves its generation; a query reports to this machine with its `{requestId, gen}`, and a report that matches no
 *    open question is dropped. One answer per `{requestId, gen}`. Generations count from 0 in each life of the tab,
 *    and a query dies with the tab, so no reply crosses a reload.
 *
 * The query, as today:
 *
 * 1. wait for the journal; when rows were pending at its read, wait for the bootstrap discovery pass as well;
 * 2. the top of the loop: a held row answers (rule 8); otherwise take the epoch, and call `verifyProjectRoute` when no
 *    row was pending, this tab holds no row and no current listing exists;
 * 3. `superseded` or a moved epoch reads again; `unavailable` answers; `verified` reads `ensureProjectLibraryState`
 *    and answers `ready` or `trashed`;
 * 4. otherwise ask discovery for a pass (a current listing serves without one) and classify its entries: `valid`
 *    reads `ensureProjectLibraryState`; `route-blocked` answers `unavailable`; `duplicate-id` answers `conflict`;
 *    otherwise `getProjectFileSystemConfig` reads the route config and classifies it against the pass as
 *    `unavailable`, `conflict` or `missing`.
 *
 * A port that rejects answers `error{message}`. The fence inputs (the discovery epoch and whether its listing is
 * current, the journal's readiness, the recovery set and each row start) are owned by the discovery and recovery
 * machines and reach this one as events, which the library service relays as they happen (A3b); this machine keeps
 * the latest of each only to compare against, and they are rebuilt from those owners on every reload (MC-R5). The
 * storage reads, the discovery pass and the access span are injected ports, so tests need no worker. Nothing in the
 * app runs this machine yet: A3b wires it.
 *
 * @module
 */
import { createActor, createAsyncLogic, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, AnyActorRef, SnapshotFrom } from 'xstate';
import type { ProjectDiscoveryEntry, ProjectDiscoveryResult } from '@taucad/filesystem';
import type { Project } from '@taucad/types';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { ProjectOpenOutcome } from '@taucad/ui-core/lib/project-open-performance';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';

/** The `LibraryCatalog.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. */
export type LibraryAccessAction = 'AccessAsked' | 'AccessCancelled' | 'AccessTop' | 'AccessReadDone' | 'Unmodelled';

/** The answer to a route's access question. */
export type AccessAnswer =
  | Readonly<{ status: 'ready'; project: Project }>
  | Readonly<{ status: 'trashed'; project: Project }>
  | Readonly<{ status: 'recovering'; recovery: Extract<PendingProjectRecovery, { status: 'recovering' }> }>
  | Readonly<{ status: 'recovery-failed'; recovery: Extract<PendingProjectRecovery, { status: 'failed' }> }>
  | Readonly<{ status: 'unavailable' | 'conflict' | 'missing' }>
  | Readonly<{ status: 'error'; message: string }>;

/** What `verifyProjectRoute` answers. */
export type RouteVerification =
  | Readonly<{ status: 'verified'; project: Project }>
  | Readonly<{ status: 'superseded' | 'unavailable' | 'discovery-required' }>;

/** What a discovery pass answers: its listing, the epoch it was taken at, and whether a current listing served it. */
export type AccessPass = Readonly<{ epoch: number; result: ProjectDiscoveryResult; cached: boolean }>;

/** The journal as route access waits for it. */
export type AccessJournal =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; pending: number }>
  | Readonly<{ status: 'failed'; message: string }>;

/** The fence inputs, as their owners last announced them. */
export type AccessFacts = Readonly<{
  epoch: number;
  /** The discovery listing's epoch is the current one. */
  current: boolean;
  /** The bootstrap discovery pass has run. */
  discoveryReady: boolean;
  /** Why the bootstrap discovery pass failed, until one succeeds (today `ensureDiscoveryReady` rejects). */
  discoveryError: string | undefined;
  journal: AccessJournal;
  recoveries: readonly PendingProjectRecovery[];
}>;

/** The fence-input events, which both the machine and each query take. */
export type AccessFactEvent =
  | { type: 'epochMoved'; epoch: number; current: boolean }
  | { type: 'discoveryReady' }
  | { type: 'discoveryFailed'; message: string }
  /** The failed bootstrap pass is being run again: questions wait for it. */
  | { type: 'discoveryRetrying' }
  /** The failed journal read is being run again: questions wait for it. */
  | { type: 'journalRetrying' }
  | { type: 'journalReady'; pending: number }
  | { type: 'journalFailed'; message: string }
  | { type: 'recoveriesChanged'; recoveries: readonly PendingProjectRecovery[] }
  | { type: 'recoveryStarted'; projectId: string };

/** Events a `libraryAccess` actor takes. */
export type LibraryAccessEvent =
  | { type: 'accessAsked'; requestId: string; projectId: string }
  | { type: 'accessCancelled'; requestId: string }
  /** A query's report; matched by `requestId` and `gen` (rule 9). */
  | { type: 'queryAnswered'; requestId: string; gen: number; epoch: number; answer: AccessAnswer; cacheHits: number }
  /** A query reached its pass after the bootstrap pass failed: run that pass again, as today's next call does. */
  | { type: 'queryWantsDiscovery'; requestId: string; gen: number }
  | AccessFactEvent;

/** Events a `libraryAccess` actor emits. */
export type LibraryAccessEmitted =
  | { type: 'accessAnswered'; requestId: string; epoch: number; answer: AccessAnswer }
  /**
   * A question arrived after the journal read or the bootstrap pass failed: run it again (recovery's `load`, the
   * bootstrap `passRequested`), as today's `ensureJournalReady` and `ensureDiscoveryReady` retry on the next call.
   */
  | { type: 'journalWanted' }
  | { type: 'discoveryWanted' }
  /** A question's query started: its access span begins. */
  | { type: 'accessBegan'; requestId: string; gen: number }
  /** A question's query ended, answered or stopped (replaced or cancelled): its access span finishes. */
  | { type: 'accessEnded'; requestId: string; gen: number; outcome: ProjectOpenOutcome; cacheHits: number };

/** One open question. */
export type AccessQuestion = Readonly<{ projectId: string; gen: number; ref: AnyActorRef }>;

/** State owned by one `libraryAccess` actor. */
export type LibraryAccessContext = Readonly<{
  facts: AccessFacts;
  /** Open questions by request id. */
  questions: Readonly<Record<string, AccessQuestion>>;
  /** The generation each request id is at; it moves on every ask after the first and on every cancel. */
  generations: Readonly<Record<string, number>>;
  /** The first defect the root `onError` caught (MC-R12, D23). */
  fault: string | undefined;
}>;

/** The public alphabet (MC-R17). */
export const libraryAccessEventTypes = [
  'accessAsked',
  'accessCancelled',
  'queryAnswered',
  'queryWantsDiscovery',
  'epochMoved',
  'discoveryReady',
  'discoveryFailed',
  'discoveryRetrying',
  'journalRetrying',
  'journalReady',
  'journalFailed',
  'recoveriesChanged',
  'recoveryStarted',
] as const satisfies ReadonlyArray<LibraryAccessEvent['type']>;

/** The machine answers every public event in its one state. */
export const libraryAccessIgnoredEvents = [] as const satisfies ReadonlyArray<
  readonly [state: string, eventType: string]
>;

/** The query child's public alphabet: its fence inputs. */
export const libraryAccessQueryEventTypes = [
  'epochMoved',
  'discoveryReady',
  'discoveryFailed',
  'discoveryRetrying',
  'journalRetrying',
  'journalReady',
  'journalFailed',
  'recoveriesChanged',
  'recoveryStarted',
] as const satisfies ReadonlyArray<AccessFactEvent['type']>;

/** A query answers every fence input in every state but its final one. */
export const libraryAccessQueryIgnoredEvents = [] as const satisfies ReadonlyArray<
  readonly [state: string, eventType: string]
>;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 *
 * @param tla - The `LibraryCatalog.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: LibraryAccessAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/** Fold a fence input into the facts. */
const withFact = (facts: AccessFacts, event: AccessFactEvent): AccessFacts => {
  switch (event.type) {
    case 'epochMoved': {
      return { ...facts, epoch: event.epoch, current: event.current };
    }
    case 'discoveryReady': {
      return { ...facts, discoveryReady: true, discoveryError: undefined };
    }
    case 'discoveryFailed': {
      return { ...facts, discoveryError: event.message };
    }
    case 'discoveryRetrying': {
      return { ...facts, discoveryError: undefined };
    }
    case 'journalRetrying': {
      return facts.journal.status === 'failed' ? { ...facts, journal: { status: 'loading' } } : facts;
    }
    case 'journalReady': {
      return { ...facts, journal: { status: 'ready', pending: event.pending } };
    }
    case 'journalFailed': {
      return { ...facts, journal: { status: 'failed', message: event.message } };
    }
    case 'recoveriesChanged': {
      return { ...facts, recoveries: event.recoveries };
    }
    case 'recoveryStarted': {
      return facts;
    }
  }
};

/** The outcome the access span records for an answer (today's `accessOutcome`). */
export const accessOutcomeOf = (answer: AccessAnswer): ProjectOpenOutcome => {
  switch (answer.status) {
    case 'ready':
    case 'trashed': {
      return 'ok';
    }
    case 'missing': {
      return 'missing';
    }
    case 'error': {
      return 'error';
    }
    default: {
      return 'unavailable';
    }
  }
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* The query: one request's loop. */

/** Input of one query. */
export type AccessQueryInput = Readonly<{
  requestId: string;
  gen: number;
  projectId: string;
  facts: AccessFacts;
  parentRef: AnyActorRef;
}>;

/** State owned by one query. */
export type AccessQueryContext = Readonly<{
  requestId: string;
  gen: number;
  projectId: string;
  parentRef: AnyActorRef;
  facts: AccessFacts;
  /** The epoch the answer rests on: the one the turn's reads observed. */
  readEpoch: number;
  /** A recovery row for the project started since the turn's first read (the model's `rs`). */
  started: boolean;
  /** What the turn's reads found, carried to the next read. */
  project: Project | undefined;
  discovery: ProjectDiscoveryResult | undefined;
  /** Passes a current listing served, for the access span. */
  cacheHits: number;
}>;

type QueryContext = AccessQueryContext;
type QueryPatch = { -readonly [K in keyof QueryContext]?: QueryContext[K] };
type SendTo = { sendTo: (ref: AnyActorRef, event: { type: string } & Record<string, unknown>) => void };
/** What a query step sends through: the parent's report. */
type QueryIo = Readonly<{ enq: SendTo }>;
type QueryStep = { target: string; reenter?: boolean; context?: QueryPatch };

type Children = Readonly<Record<string, AnyActorRef | undefined>>;
/** An invoke's answer, typed by hand: alpha.59 cannot type a `{ to, meta }` `onDone`'s arguments. */
type Done<Output> = Readonly<{ context: QueryContext; event: Readonly<{ output: Output }>; children: Children }>;

type Settles = <Args>(tla: LibraryAccessAction, to: (args: Args, enq: SendTo) => QueryStep) => never;
/**
 * An invoke's `onDone` or `onError` as `{ to, meta }` (MC-R27), with its arguments typed by hand.
 *
 * @param tla - The `LibraryCatalog.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, as whatever the config expects.
 */
// oxlint-disable-next-line typescript/consistent-type-assertions -- see `refines`.
const settles = ((tla: LibraryAccessAction, to: unknown) => ({ meta: { tla }, to })) as unknown as Settles;

const ioOf = (enq: SendTo, _children: Readonly<Record<string, AnyActorRef | undefined>>): QueryIo => ({ enq });

/** The row this tab holds for the project; an active one comes first, as `AccessAnswerFenced` states. */
const heldRow = (context: QueryContext): PendingProjectRecovery | undefined => {
  const rows = context.facts.recoveries.filter((recovery) => recovery.projectId === context.projectId);
  return rows.find((recovery) => recovery.status === 'recovering') ?? rows[0];
};

/** Rule 8: the reads still stand. */
const fenced = (context: QueryContext): boolean =>
  context.readEpoch === context.facts.epoch && !context.started && heldRow(context) === undefined;

const answer = (context: QueryContext, io: QueryIo, result: AccessAnswer): QueryStep => {
  io.enq.sendTo(context.parentRef, {
    type: 'queryAnswered',
    requestId: context.requestId,
    gen: context.gen,
    epoch: context.facts.epoch,
    answer: result,
    cacheHits: context.cacheHits,
  });
  return { target: '#library-access-query.answered', context: {} };
};

/** The top of the loop (rule 8): a held row answers, otherwise the turn's first read starts at the current epoch. */
const top = (context: QueryContext, io: QueryIo): QueryStep => {
  const held = heldRow(context);
  if (held?.status === 'recovering') {
    return answer(context, io, { status: 'recovering', recovery: held });
  }
  if (held?.status === 'failed') {
    return answer(context, io, { status: 'recovery-failed', recovery: held });
  }
  const { facts } = context;
  const pending = facts.journal.status === 'ready' ? facts.journal.pending : 0;
  const verify = pending === 0 && facts.recoveries.length === 0 && !facts.current;
  return {
    target: verify ? '#library-access-query.verifying' : '#library-access-query.discovering',
    reenter: true,
    context: { readEpoch: facts.epoch, started: false, project: undefined, discovery: undefined },
  };
};

/** Answer if the reads still stand (rule 8); otherwise read again from the top. */
const fencedAnswer = (context: QueryContext, io: QueryIo, result: AccessAnswer): QueryStep =>
  fenced(context) ? answer(context, io, result) : top(context, io);

const projectOf = (entry: Extract<ProjectDiscoveryEntry, { status: 'valid' }>): Project => ({
  ...entry.manifest,
  id: entry.projectId,
});

/** The journal is read, and the bootstrap pass has run when rows were pending: the loop may start. */
const mayStart = (facts: AccessFacts): boolean =>
  facts.journal.status === 'ready' && (facts.journal.pending === 0 || facts.discoveryReady);

/** Ports of a query. */
const verifyProjectRoute = createAsyncLogic<RouteVerification, Readonly<{ projectId: string }>>({
  run: async () => {
    throw new Error('libraryAccess: the verifyProjectRoute port was not provided; createLibraryAccess provides it.');
  },
});
const ensureProjectLibraryState = createAsyncLogic<Readonly<{ deletedAt?: number }>, Readonly<{ projectId: string }>>({
  run: async () => {
    throw new Error(
      'libraryAccess: the ensureProjectLibraryState port was not provided; createLibraryAccess provides it.',
    );
  },
});
const discoveryPass = createAsyncLogic<AccessPass, Readonly<{ requestId: string; gen: number }>>({
  run: async () => {
    throw new Error('libraryAccess: the discoveryPass port was not provided; createLibraryAccess provides it.');
  },
});
const getProjectFileSystemConfig = createAsyncLogic<
  'unavailable' | 'conflict' | 'missing',
  Readonly<{ projectId: string; discovery: ProjectDiscoveryResult }>
>({
  run: async () => {
    throw new Error(
      'libraryAccess: the getProjectFileSystemConfig port was not provided; createLibraryAccess provides it.',
    );
  },
});

/** A port rejected: the question is answered `error`, as today's rejection is, unless the reads no longer stand. */
const portFailed = settles(
  'AccessReadDone',
  (
    { context, event, children }: Readonly<{ context: QueryContext; event: { error: unknown }; children: Children }>,
    enq,
  ) => fencedAnswer(context, ioOf(enq, children), { status: 'error', message: messageOf(event.error) }),
);

/**
 * The pass rejected. A pass moves the epoch when it starts, and a rejection carries no epoch to fence on, so only a
 * recovery that started or a row now held reads again; otherwise the question is answered `error`, as today's
 * rejection is. Fencing it on the turn's epoch would read again after every failed pass, without end.
 */
const passFailed = settles(
  'AccessReadDone',
  (
    { context, event, children }: Readonly<{ context: QueryContext; event: { error: unknown }; children: Children }>,
    enq,
  ) => {
    const io = ioOf(enq, children);
    return context.started || heldRow(context) !== undefined
      ? top(context, io)
      : answer(context, io, { status: 'error', message: messageOf(event.error) });
  },
);

/** One request's query. Its ports throw until `createLibraryAccess` provides them. */
export const libraryAccessQueryMachine = setup({
  schemas: {
    context: types<QueryContext>(),
    events: eventSchemas<AccessFactEvent>(),
    input: types<AccessQueryInput>(),
    transitionMeta: types<{ tla: LibraryAccessAction }>(),
  },
  actors: { verifyProjectRoute, ensureProjectLibraryState, discoveryPass, getProjectFileSystemConfig },
}).createMachine({
  id: 'library-access-query',
  version: '1',
  // A defect answers the question `error` and ends the query, so its asker is never left waiting (MC-R12, D23).
  onError: refines('Unmodelled', ({ context, event, children }, enq) =>
    answer(context, ioOf(enq, children), { status: 'error', message: messageOf(event.error) }),
  ),
  context: ({ input }) => ({
    requestId: input.requestId,
    gen: input.gen,
    projectId: input.projectId,
    parentRef: input.parentRef,
    facts: input.facts,
    readEpoch: input.facts.epoch,
    started: false,
    project: undefined,
    discovery: undefined,
    cacheHits: 0,
  }),
  on: {
    epochMoved: refines('Unmodelled', ({ context, event }) => ({ context: { facts: withFact(context.facts, event) } })),
    discoveryReady: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    discoveryFailed: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    discoveryRetrying: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    journalRetrying: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    journalReady: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    journalFailed: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    recoveriesChanged: refines('Unmodelled', ({ context, event }) => ({
      context: { facts: withFact(context.facts, event) },
    })),
    recoveryStarted: refines('Unmodelled', ({ context, event }) =>
      event.projectId === context.projectId ? { context: { started: true } } : {},
    ),
  },
  initial: 'waiting',
  states: {
    /** Step 1: the journal, and the bootstrap pass when rows were pending. */
    waiting: {
      always: refines('AccessTop', ({ context, children }, enq) => {
        const io = ioOf(enq, children);
        const { facts } = context;
        if (facts.journal.status === 'failed') {
          return answer(context, io, { status: 'error', message: facts.journal.message });
        }
        if (mayStart(facts)) {
          return top(context, io);
        }
        // Rows were pending and the bootstrap pass failed: the question is answered as today's rejection is.
        return facts.journal.status === 'ready' && facts.discoveryError !== undefined
          ? answer(context, io, { status: 'error', message: facts.discoveryError })
          : undefined;
      }),
    },
    verifying: {
      invoke: {
        src: 'verifyProjectRoute',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: settles('AccessReadDone', ({ context, event, children }: Done<RouteVerification>, enq) => {
          const io = ioOf(enq, children);
          const verification = event.output;
          if (verification.status === 'superseded' || context.readEpoch !== context.facts.epoch) {
            return top(context, io);
          }
          if (verification.status === 'unavailable') {
            return fencedAnswer(context, io, { status: 'unavailable' });
          }
          if (verification.status === 'verified') {
            return { target: 'ensuring', context: { project: verification.project } };
          }
          return { target: 'discovering' };
        }),
        onError: portFailed,
      },
    },
    /** Step 4: a pass, once the bootstrap pass has run. */
    discovering: {
      initial: 'gate',
      states: {
        /*
         * The bootstrap pass has not run. A failure it reports while the query waits here answers `error`, as today's
         * rejection does; one that came before the query got here is run again first, as today's next
         * `ensureDiscoveryReady` call does.
         */
        gate: {
          always: refines('AccessTop', ({ context }, enq) => {
            if (context.facts.discoveryReady) {
              return { target: 'passing' };
            }
            if (context.facts.discoveryError === undefined) {
              return undefined;
            }
            enq.sendTo(context.parentRef, {
              type: 'queryWantsDiscovery',
              requestId: context.requestId,
              gen: context.gen,
            });
            return { target: 'retrying' };
          }),
          on: {
            discoveryFailed: refines('AccessTop', ({ context, event, children }, enq) =>
              answer(context, ioOf(enq, children), { status: 'error', message: event.message }),
            ),
          },
        },
        /** Waiting for the parent to run the failed bootstrap pass again (`discoveryRetrying`). */
        retrying: {
          always: refines('AccessTop', ({ context }) => {
            if (context.facts.discoveryReady) {
              return { target: 'passing' };
            }
            return context.facts.discoveryError === undefined ? { target: 'gate' } : undefined;
          }),
          on: {
            discoveryFailed: refines('AccessTop', ({ context, event, children }, enq) =>
              answer(context, ioOf(enq, children), { status: 'error', message: event.message }),
            ),
          },
        },
        passing: {
          invoke: {
            src: 'discoveryPass',
            input: ({ context }) => ({ requestId: context.requestId, gen: context.gen }),
            onDone: settles('AccessReadDone', ({ context, event, children }: Done<AccessPass>, enq) => {
              const io = ioOf(enq, children);
              const pass = event.output;
              // Rule 8: the pass's own epoch is what its listing rests on.
              const read: QueryContext = {
                ...context,
                readEpoch: pass.epoch,
                cacheHits: context.cacheHits + (pass.cached ? 1 : 0),
              };
              if (pass.epoch !== context.facts.epoch) {
                const step = top(read, io);
                return { ...step, context: { ...step.context, cacheHits: read.cacheHits } };
              }
              const ofProject = pass.result.entries.filter(
                (entry) => 'projectId' in entry && entry.projectId === context.projectId,
              );
              const valid = ofProject.find(
                (entry): entry is Extract<ProjectDiscoveryEntry, { status: 'valid' }> => entry.status === 'valid',
              );
              const patch: QueryPatch = { readEpoch: pass.epoch, cacheHits: read.cacheHits, discovery: pass.result };
              if (valid !== undefined) {
                return { target: '#library-access-query.ensuring', context: { ...patch, project: projectOf(valid) } };
              }
              if (ofProject.some((entry) => entry.status === 'route-blocked')) {
                const step = fencedAnswer(read, io, { status: 'unavailable' });
                return { ...step, context: { ...patch, ...step.context } };
              }
              if (ofProject.some((entry) => entry.status === 'duplicate-id')) {
                const step = fencedAnswer(read, io, { status: 'conflict' });
                return { ...step, context: { ...patch, ...step.context } };
              }
              return { target: '#library-access-query.classifying', context: patch };
            }),
            onError: passFailed,
          },
        },
      },
    },
    /** `ensureProjectLibraryState`: whether the found project is in the trash. */
    ensuring: {
      invoke: {
        src: 'ensureProjectLibraryState',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: settles(
          'AccessReadDone',
          ({ context, event, children }: Done<Readonly<{ deletedAt?: number }>>, enq) => {
            const io = ioOf(enq, children);
            const { project } = context;
            if (project === undefined) {
              return top(context, io);
            }
            return fencedAnswer(
              context,
              io,
              event.output.deletedAt === undefined ? { status: 'ready', project } : { status: 'trashed', project },
            );
          },
        ),
        onError: portFailed,
      },
    },
    /** `getProjectFileSystemConfig`: why a project the pass did not find cannot open. */
    classifying: {
      invoke: {
        src: 'getProjectFileSystemConfig',
        input: ({ context }) => ({
          projectId: context.projectId,
          discovery: context.discovery ?? { entries: [], roots: [] },
        }),
        onDone: settles(
          'AccessReadDone',
          ({ context, event, children }: Done<'unavailable' | 'conflict' | 'missing'>, enq) =>
            fencedAnswer(context, ioOf(enq, children), { status: event.output }),
        ),
        onError: portFailed,
      },
    },
    answered: { type: 'final' },
  },
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* The machine: the questions, their generations and the fence inputs. */

type Context = LibraryAccessContext;
type Emit = { emit: (event: LibraryAccessEmitted) => void };

const initialFacts: AccessFacts = {
  epoch: 0,
  current: false,
  discoveryReady: false,
  discoveryError: undefined,
  journal: { status: 'loading' },
  recoveries: [],
};

/** Every query hears a fence input as soon as the machine does. */
const forward = (context: Context, event: AccessFactEvent, enq: SendTo): void => {
  for (const question of Object.values(context.questions)) {
    enq.sendTo(question.ref, event);
  }
};

const foldFact = refines(
  'Unmodelled',
  ({ context, event }: { context: Context; event: AccessFactEvent }, enq: SendTo) => {
    forward(context, event, enq);
    return { context: { facts: withFact(context.facts, event) } };
  },
);

/** Route access. Its query ports throw until `createLibraryAccess` provides them. */
export const libraryAccessMachine = setup({
  schemas: {
    context: types<Context>(),
    events: eventSchemas<LibraryAccessEvent>(),
    emitted: eventSchemas<LibraryAccessEmitted>(),
    transitionMeta: types<{ tla: LibraryAccessAction }>(),
  },
  actors: { query: libraryAccessQueryMachine },
}).createMachine({
  id: 'library-access',
  version: '1',
  // A defect is recorded and the machine keeps answering: the first is kept (MC-R12, D23).
  onError: refines('Unmodelled', ({ context, event }) => ({
    context: { fault: context.fault ?? messageOf(event.error) },
  })),
  context: { facts: initialFacts, questions: {}, generations: {}, fault: undefined },
  on: {
    // Asking again under an id replaces its query and moves its generation (rule 9).
    accessAsked: refines('AccessAsked', ({ context, event, self, actors }, enq) => {
      const previous = context.questions[event.requestId];
      if (previous !== undefined) {
        enq.stop(previous.ref);
        // A query stopped before its answer ends its span as today's `finally` does.
        enq.emit({
          type: 'accessEnded',
          requestId: event.requestId,
          gen: previous.gen,
          outcome: 'error',
          cacheHits: 0,
        });
      }
      // A failed read is run again for the new question (and every open one waits for it), as today's next call does.
      const retries: AccessFactEvent[] = [
        ...(context.facts.journal.status === 'failed' ? [{ type: 'journalRetrying' } as const] : []),
        ...(context.facts.discoveryError === undefined ? [] : [{ type: 'discoveryRetrying' } as const]),
      ];
      let { facts } = context;
      for (const retry of retries) {
        facts = withFact(facts, retry);
      }
      for (const retry of retries) {
        for (const [requestId, open] of Object.entries(context.questions)) {
          if (requestId !== event.requestId) {
            enq.sendTo(open.ref, retry);
          }
        }
        enq.emit({ type: retry.type === 'journalRetrying' ? 'journalWanted' : 'discoveryWanted' });
      }
      const seen = context.generations[event.requestId];
      const gen = seen === undefined ? 0 : seen + 1;
      const ref = enq.spawn(actors.query, {
        id: `query:${event.requestId}:${String(gen)}`,
        input: { requestId: event.requestId, gen, projectId: event.projectId, facts, parentRef: self },
      });
      enq.emit({ type: 'accessBegan', requestId: event.requestId, gen });
      return {
        context: {
          facts,
          questions: { ...context.questions, [event.requestId]: { projectId: event.projectId, gen, ref } },
          generations: { ...context.generations, [event.requestId]: gen },
        },
      };
    }),
    accessCancelled: refines('AccessCancelled', ({ context, event }, enq) => {
      const question = context.questions[event.requestId];
      // Nothing open under this id: the cancel is a repeat, or the answer already went.
      if (question === undefined) {
        return {};
      }
      enq.stop(question.ref);
      enq.emit({ type: 'accessEnded', requestId: event.requestId, gen: question.gen, outcome: 'error', cacheHits: 0 });
      const { [event.requestId]: _cancelled, ...questions } = context.questions;
      return { context: { questions, generations: { ...context.generations, [event.requestId]: question.gen + 1 } } };
    }),
    queryAnswered: refines('AccessReadDone', ({ context, event }, enq: Emit & SendTo) => {
      const question = context.questions[event.requestId];
      // Rule 9: a report from a replaced, cancelled or answered query is stale.
      if (question === undefined || question.gen !== event.gen) {
        return {};
      }
      enq.emit({ type: 'accessAnswered', requestId: event.requestId, epoch: event.epoch, answer: event.answer });
      enq.emit({
        type: 'accessEnded',
        requestId: event.requestId,
        gen: event.gen,
        outcome: accessOutcomeOf(event.answer),
        cacheHits: event.cacheHits,
      });
      const { [event.requestId]: _answered, ...questions } = context.questions;
      return { context: { questions } };
    }),
    /* The question's query reached its pass after the bootstrap pass failed: run it again for every open question. */
    queryWantsDiscovery: refines('Unmodelled', ({ context, event }, enq: Emit & SendTo) => {
      const question = context.questions[event.requestId];
      if (question?.gen !== event.gen || context.facts.discoveryError === undefined) {
        return {};
      }
      const retry = { type: 'discoveryRetrying' } as const;
      for (const open of Object.values(context.questions)) {
        enq.sendTo(open.ref, retry);
      }
      enq.emit({ type: 'discoveryWanted' });
      return { context: { facts: withFact(context.facts, retry) } };
    }),
    epochMoved: foldFact,
    discoveryReady: foldFact,
    discoveryFailed: foldFact,
    discoveryRetrying: foldFact,
    journalRetrying: foldFact,
    journalReady: foldFact,
    journalFailed: foldFact,
    recoveriesChanged: foldFact,
    recoveryStarted: foldFact,
  },
});

export type LibraryAccessActor = Actor<typeof libraryAccessMachine>;
export type LibraryAccessSnapshot = SnapshotFrom<typeof libraryAccessMachine>;

/** The open questions' ids (MC-R25). */
export const selectOpenQuestions = (snapshot: LibraryAccessSnapshot): string[] =>
  Object.keys(snapshot.context.questions);

/** The access span of one question: `finish` is called once, with the outcome and the passes a listing served. */
export type AccessSpan = Readonly<{
  finish: (outcome: ProjectOpenOutcome, fields: Readonly<{ cacheHits: number }>) => void;
}>;

/** The storage reads route access makes, the discovery pass, and the optional access span. */
export type LibraryAccessPorts = Readonly<{
  verifyProjectRoute: (input: Readonly<{ projectId: string; signal: AbortSignal }>) => Promise<RouteVerification>;
  /** Today's `ensureProjectLibraryState`: the project's library row, created from disk when absent. */
  ensureProjectLibraryState: (
    input: Readonly<{ projectId: string; signal: AbortSignal }>,
  ) => Promise<Readonly<{ deletedAt?: number }>>;
  /** Ask discovery for a pass (`passRequested` with reuse) and answer with its settled listing and epoch. */
  discoveryPass: (input: Readonly<{ requestId: string; gen: number; signal: AbortSignal }>) => Promise<AccessPass>;
  /**
   * Read the project's route config and classify it against the pass that did not find the project: `unavailable`
   * when its root was inaccessible or its identity could not be read, `conflict` for a foreign identity, else `missing`.
   */
  getProjectFileSystemConfig: (
    input: Readonly<{ projectId: string; discovery: ProjectDiscoveryResult; signal: AbortSignal }>,
  ) => Promise<'unavailable' | 'conflict' | 'missing'>;
  /** Begin one question's `access.check` span (`readLocalProjectOpenPerformance()?.begin('access.check')`). */
  beginAccessSpan?: () => AccessSpan | undefined;
}>;

/**
 * An unstarted route-access actor over its ports (MC-R4).
 *
 * @param input - The ports, and the actor options tests inject.
 * @returns The actor; start it once.
 */
export const createLibraryAccess = (
  input: Readonly<{ ports: LibraryAccessPorts }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): LibraryAccessActor => {
  const { ports, clock, inspect, onRejectedEvent } = input;
  const query = libraryAccessQueryMachine.provide({
    actors: {
      verifyProjectRoute: createAsyncLogic<RouteVerification, Readonly<{ projectId: string }>>({
        run: async ({ input: { projectId }, signal }) => ports.verifyProjectRoute({ projectId, signal }),
      }),
      ensureProjectLibraryState: createAsyncLogic<Readonly<{ deletedAt?: number }>, Readonly<{ projectId: string }>>({
        run: async ({ input: { projectId }, signal }) => ports.ensureProjectLibraryState({ projectId, signal }),
      }),
      discoveryPass: createAsyncLogic<AccessPass, Readonly<{ requestId: string; gen: number }>>({
        run: async ({ input: { requestId, gen }, signal }) => ports.discoveryPass({ requestId, gen, signal }),
      }),
      getProjectFileSystemConfig: createAsyncLogic<
        'unavailable' | 'conflict' | 'missing',
        Readonly<{ projectId: string; discovery: ProjectDiscoveryResult }>
      >({
        run: async ({ input: { projectId, discovery }, signal }) =>
          ports.getProjectFileSystemConfig({ projectId, discovery, signal }),
      }),
    },
  });
  const machine = libraryAccessMachine.provide({ actors: { query } });
  const actor = createActor(machine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  });
  // The spans are host objects: they stay in this closure, keyed by question and generation, never in context.
  const { beginAccessSpan } = ports;
  if (beginAccessSpan !== undefined) {
    const spans = new Map<string, AccessSpan | undefined>();
    const keyOf = (event: Readonly<{ requestId: string; gen: number }>): string =>
      `${event.requestId}:${String(event.gen)}`;
    actor.on('accessBegan', (event) => {
      spans.set(keyOf(event), beginAccessSpan());
    });
    actor.on('accessEnded', (event) => {
      const key = keyOf(event);
      const span = spans.get(key);
      spans.delete(key);
      span?.finish(event.outcome, { cacheHits: event.cacheHits });
    });
    // The machine stopped with questions open (the tab's library went away): their spans end as today's `finally`.
    const finishOpen = (): void => {
      for (const span of spans.values()) {
        span?.finish('error', { cacheHits: 0 });
      }
      spans.clear();
    };
    actor.subscribe({ complete: finishOpen, error: finishOpen });
  }
  return actor;
};
