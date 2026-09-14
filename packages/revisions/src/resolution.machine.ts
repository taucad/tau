/**
 * `resolution.machine` — one conflicted revision, and the choices that end it.
 *
 * A conflicted merge does not fail: it records a conflicted revision on the
 * branch a person merged *from*, leaves the branch they were on and its files
 * byte-identical, and shows *Needs resolution* (A22, AC14). This machine owns
 * what happens next, one actor per conflicted revision, spawned by
 * `project-revisions.machine` with a stored ref and stopped with `stopChild`
 * when it resolves or is abandoned (A38).
 *
 * Per file, never per conflict-as-a-whole: *Keep mine*, *Keep theirs*, and for a
 * file whose three terms are decodable text, *Open in editor* — which is handed
 * marker text and answers with the resolved bytes. Nothing is auto-resolved and
 * nothing is silent. *Ask chat to resolve* seeds a turn on the conflict branch's
 * checkout with the conflict record as its context; it is a request, so the
 * machine emits it and stays where it was.
 *
 * `finish` mints the resolving revision — a normal revision on that branch, from
 * the paths that settled plus one chosen side each — and the person merges
 * again, which now fast-forwards. `abandon` leaves the conflicted revision in
 * History, reachable by id, because conflict evidence is one of the things local
 * GC is not allowed to collect (A25).
 *
 * Context holds paths and side choices only: no bytes, no functions (I29). The
 * editor's resolved bytes ride the event into the actor's input and are held by
 * the effects module, not here.
 */

import { assign, emit, enqueueActions, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

/** Which side of a conflict one file takes. @public */
export type ResolutionSide = 'mine' | 'theirs' | 'editor';

/** One conflicted path, and whether it can be opened as text. @public */
export type ResolutionPath = Readonly<{
  path: string;
  /**
   * Whether *Open in editor* is offered for it.
   *
   * False for a binary or parametric file and for a file-versus-directory
   * collision: those are choose-one only, because there is no text to edit
   * (A22, canvas "Conflicts" — `params/wall.json` has no *Open*).
   */
  openable: boolean;
}>;

/** Input accepted when creating the resolutionMachine actor. @public */
export type ResolutionMachineInput = Readonly<{
  projectId: string;
  /** The conflicted revision this actor is about. */
  revisionId: string;
  /** The branch it sits on, when the spawner already knows it. */
  branch?: string;
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by resolutionMachine. @public */
export type ResolutionMachineContext = Readonly<{
  projectId: string;
  revisionId: string;
  branch: string | undefined;
  /** The two branch names the markers are labelled with. */
  labels: Readonly<{ ours: string; theirs: string }> | undefined;
  /** Every path that did not settle. */
  paths: readonly ResolutionPath[];
  /** The side chosen per path, by path. Choices, never bytes (I29). */
  chosen: Readonly<Record<string, ResolutionSide>>;
  /**
   * The path an effect is working on and the side it was asked for.
   *
   * A choice, not bytes: the editor's resolved text rides the event into the
   * actor's input and is never stored here (I29).
   */
  pending: Readonly<{ path: string; side: ResolutionSide }> | undefined;
  /** The resolving revision, once `finish` minted it. */
  resolvedRevisionId: string | undefined;
  reason: string | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by resolutionMachine. @public */
export type ResolutionMachineEvent =
  | Readonly<{ type: 'keepMine'; path: string }>
  | Readonly<{ type: 'keepTheirs'; path: string }>
  | Readonly<{ type: 'openInEditor'; path: string }>
  /** The editor's answer: the file as the person resolved it. */
  | Readonly<{ type: 'resolvedInEditor'; path: string; content: string }>
  | Readonly<{ type: 'askChat' }>
  | Readonly<{ type: 'finish' }>
  | Readonly<{ type: 'abandon' }>
  /** Read the conflict again — a branch that moved changed what is left to do. */
  | Readonly<{ type: 'reload' }>;

/** Facts resolutionMachine emits, and sends to its parent when they move a branch. @public */
export type ResolutionMachineEmitted =
  | Readonly<{ type: 'resolutionChanged'; revisionId: string }>
  | Readonly<{ type: 'conflictResolved'; revisionId: string; branch: string | undefined }>
  /**
   * *Ask chat to resolve*: start a turn on this branch's checkout with the
   * conflict as its context.
   *
   * A request rather than a command, because the machine cannot start a chat —
   * only a page or a CLI can, and both hold the root that routes this (A38).
   */
  | Readonly<{ type: 'turnRequested'; revisionId: string; checkoutId: string | undefined; paths: readonly string[] }>
  /** The marker text one file was opened with. */
  | Readonly<{ type: 'conflictMaterialized'; path: string; text: string; ours: string; theirs: string }>
  | Readonly<{ type: 'toast.error'; message: string }>;

/** What `loadConflict` answers about one conflicted revision. @public */
export type ResolutionLoadActorOutput = Readonly<{
  /** The branch the conflicted revision is the head of, when one names it. */
  branch: string | undefined;
  labels: Readonly<{ ours: string; theirs: string }>;
  paths: readonly ResolutionPath[];
  /** The checkout that branch has, for *Ask chat to resolve*. */
  checkoutId: string | undefined;
}>;

/** Input of the injected `loadConflict` actor. @public */
export type ResolutionLoadActorInput = Readonly<{ projectId: string; revisionId: string }>;

/** What `materialize` answers for one path. @public */
export type ResolutionMaterializeActorOutput = Readonly<{
  path: string;
  /** The marker text, or `undefined` for a file with no text form. */
  text: string | undefined;
  /** The two sides on their own, for *Compare* (A27, D19). */
  ours: string;
  theirs: string;
}>;

/** Input of the injected `applyResolution` actor. @public */
export type ResolutionApplyActorInput = Readonly<{
  projectId: string;
  revisionId: string;
  path: string;
  side: ResolutionSide;
  /** The resolved file, for `side: 'editor'` only. */
  content?: string;
}>;

/** What `finishMerge` answers. @public */
export type ResolutionFinishActorOutput = Readonly<{ revisionId: string; branch: string | undefined }>;

/** What `seedTurn` answers: where a turn asked to resolve this would run. @public */
export type ResolutionSeedTurnActorOutput = Readonly<{
  checkoutId: string | undefined;
  paths: readonly string[];
}>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'That resolution step failed.';

/**
 * Headless per-file resolution of one conflicted revision.
 *
 * @public
 */
export const resolutionMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as ResolutionMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as ResolutionMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as ResolutionMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as ResolutionMachineInput,
  },
  actors: {
    loadConflict: fromPromise<ResolutionLoadActorOutput, ResolutionLoadActorInput>(async () => {
      throw new Error('resolutionMachine: the loadConflict actor was not provided.');
    }),
    materialize: fromPromise<
      ResolutionMaterializeActorOutput,
      Readonly<{ projectId: string; revisionId: string; path: string }>
    >(async () => {
      throw new Error('resolutionMachine: the materialize actor was not provided.');
    }),
    applyResolution: fromPromise<void, ResolutionApplyActorInput>(async () => {
      throw new Error('resolutionMachine: the applyResolution actor was not provided.');
    }),
    finishMerge: fromPromise<ResolutionFinishActorOutput, Readonly<{ projectId: string; revisionId: string }>>(
      async () => {
        throw new Error('resolutionMachine: the finishMerge actor was not provided.');
      },
    ),
    seedTurn: fromPromise<ResolutionSeedTurnActorOutput, Readonly<{ projectId: string; revisionId: string }>>(
      async () => {
        throw new Error('resolutionMachine: the seedTurn actor was not provided.');
      },
    ),
  },
  guards: {
    /* Every conflicted path has a side. The guard, not a disabled button, is
       what makes *Merge into `<current>`* unreachable while one is unanswered. */
    /* `paths.length > 0` as well, so the guard and `selectResolutionFacet`'s
       `ready` are the same question: an empty conflict has nothing to mint and
       `finish` would otherwise be reachable on it (review R12). */
    everyPathChosen: ({ context }) =>
      context.paths.length > 0 && context.paths.every((entry) => context.chosen[entry.path] !== undefined),
  },
  actions: {
    choose: assign({
      pending: (_, params: Readonly<{ path: string; side: ResolutionSide }>) => params,
    }),
    record: assign({
      chosen: ({ context }) =>
        context.pending === undefined
          ? context.chosen
          : { ...context.chosen, [context.pending.path]: context.pending.side },
      pending: undefined,
    }),
    failWith: assign({ reason: (_, params: Readonly<{ reason: string }>) => params.reason, pending: undefined }),
    announceChange: enqueueActions(({ context, enqueue }) => {
      const fact: ResolutionMachineEmitted = { type: 'resolutionChanged', revisionId: context.revisionId };
      enqueue.emit(fact);
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, fact);
      }
    }),
    announce: enqueueActions(({ context, enqueue }) => {
      const fact: ResolutionMachineEmitted = {
        type: 'conflictResolved',
        revisionId: context.resolvedRevisionId ?? '',
        branch: context.branch,
      };
      enqueue.emit(fact);
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, fact);
      }
    }),
  },
}).createMachine({
  id: 'resolution',
  context: ({ input }) => ({
    projectId: input.projectId,
    revisionId: input.revisionId,
    branch: input.branch,
    labels: undefined,
    paths: [],
    chosen: {},
    pending: undefined,
    resolvedRevisionId: undefined,
    reason: undefined,
    parentRef: input.parentRef,
  }),
  /* Abandoning is always available: a person who changes their mind mid-choice
     is not a state to model, and the conflicted revision stays in History. */
  on: {
    abandon: { target: '.abandoned' },
  },
  initial: 'open',
  states: {
    open: {
      initial: 'loading',
      states: {
        loading: {
          invoke: {
            src: 'loadConflict',
            input: ({ context }) => ({ projectId: context.projectId, revisionId: context.revisionId }),
            onDone: {
              target: '#resolution.resolving',
              actions: [
                assign({
                  branch: ({ context, event }) => event.output.branch ?? context.branch,
                  labels: ({ event }) => event.output.labels,
                  paths: ({ event }) => event.output.paths,
                  reason: undefined,
                }),
                'announceChange',
              ],
            },
            onError: {
              target: 'failed',
              actions: { type: 'failWith', params: { reason: 'This conflict could not be read.' } },
            },
          },
        },
        /* Not terminal: the store may have been mid-write, and *Retry* is one
           event. The failure edge every invoked effect has (I29). */
        failed: {
          entry: [
            emit(
              ({ context }): ResolutionMachineEmitted => ({
                type: 'toast.error',
                message: context.reason ?? 'This conflict could not be read.',
              }),
            ),
            'announceChange',
          ],
          on: { reload: { target: 'loading' } },
        },
      },
    },
    resolving: {
      initial: 'idle',
      on: {
        reload: { target: 'open' },
      },
      states: {
        idle: {
          on: {
            keepMine: {
              target: 'applying',
              actions: { type: 'choose', params: ({ event }) => ({ path: event.path, side: 'mine' }) },
            },
            keepTheirs: {
              target: 'applying',
              actions: { type: 'choose', params: ({ event }) => ({ path: event.path, side: 'theirs' }) },
            },
            resolvedInEditor: {
              target: 'applying',
              actions: { type: 'choose', params: ({ event }) => ({ path: event.path, side: 'editor' }) },
            },
            openInEditor: {
              target: 'materializing',
              actions: { type: 'choose', params: ({ event }) => ({ path: event.path, side: 'editor' }) },
            },
            askChat: { target: 'seeding' },
            finish: { guard: 'everyPathChosen', target: '#resolution.finishing' },
          },
        },
        applying: {
          invoke: {
            src: 'applyResolution',
            input: ({ context, event }) => ({
              projectId: context.projectId,
              revisionId: context.revisionId,
              path: context.pending?.path ?? '',
              side: context.pending?.side ?? 'mine',
              /* The resolved file travels with the event that asked for it, so
                 the bytes reach the effect without passing through context. */
              ...(event.type === 'resolvedInEditor' ? { content: event.content } : {}),
            }),
            onDone: { target: 'idle', actions: ['record', 'announceChange'] },
            onError: {
              target: 'failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error), pending: undefined }),
            },
          },
        },
        materializing: {
          invoke: {
            src: 'materialize',
            input: ({ context }) => ({
              projectId: context.projectId,
              revisionId: context.revisionId,
              path: context.pending?.path ?? '',
            }),
            onDone: {
              target: 'idle',
              actions: enqueueActions(({ context, enqueue, event }) => {
                if (event.output.text === undefined) {
                  enqueue.emit({
                    type: 'toast.error',
                    message: 'That file cannot be opened as text. Keep one side instead.',
                  });
                } else {
                  const fact: ResolutionMachineEmitted = {
                    type: 'conflictMaterialized',
                    path: event.output.path,
                    text: event.output.text,
                    ours: event.output.ours,
                    theirs: event.output.theirs,
                  };
                  enqueue.emit(fact);
                  /* Through the parent as well: the editor that shows this is on
                   * a page, and a page holds the root and nothing else (A38). */
                  if (context.parentRef !== undefined) {
                    enqueue.sendTo(context.parentRef, { ...fact, revisionId: context.revisionId });
                  }
                }
                enqueue.assign({ pending: undefined });
              }),
            },
            onError: {
              target: 'failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error), pending: undefined }),
            },
          },
        },
        seeding: {
          invoke: {
            src: 'seedTurn',
            input: ({ context }) => ({ projectId: context.projectId, revisionId: context.revisionId }),
            onDone: {
              target: 'idle',
              actions: enqueueActions(({ context, enqueue, event }) => {
                const fact: ResolutionMachineEmitted = {
                  type: 'turnRequested',
                  revisionId: context.revisionId,
                  checkoutId: event.output.checkoutId,
                  paths: event.output.paths,
                };
                enqueue.emit(fact);
                if (context.parentRef !== undefined) {
                  enqueue.sendTo(context.parentRef, fact);
                }
              }),
            },
            onError: {
              target: 'failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
        /* Every choice a person already made is still recorded, so the next one
           carries on from here rather than starting over. */
        failed: {
          entry: [
            emit(
              ({ context }): ResolutionMachineEmitted => ({
                type: 'toast.error',
                message: context.reason ?? 'That resolution step failed.',
              }),
            ),
            'announceChange',
          ],
          always: { target: 'idle' },
        },
      },
    },
    finishing: {
      invoke: {
        src: 'finishMerge',
        input: ({ context }) => ({ projectId: context.projectId, revisionId: context.revisionId }),
        onDone: {
          target: 'resolved',
          actions: assign({
            resolvedRevisionId: ({ event }) => event.output.revisionId,
            branch: ({ context, event }) => event.output.branch ?? context.branch,
          }),
        },
        /* `resolving.failed`, not `resolving`: the sibling already emits the
           toast and `always` returns to `idle`, so the person gets the rows
           back *and* the reason. Targeting the parent lands in `idle` and says
           nothing (review R3). */
        onError: {
          target: 'resolving.failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
        },
      },
    },
    resolved: {
      type: 'final',
      entry: 'announce',
    },
    /* The conflicted revision stays: it is the only record of what collided,
       and Restore-by-id still reaches it (A25). */
    abandoned: { type: 'final' },
  },
});

/**
 * Selects the facet the *Needs resolution* rows render.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The revision, its branch, and each path with the side chosen for it.
 * @public
 */
export const selectResolutionFacet = (
  snapshot: SnapshotFrom<typeof resolutionMachine>,
): Readonly<{
  revisionId: string;
  branch: string | undefined;
  labels: Readonly<{ ours: string; theirs: string }> | undefined;
  paths: ReadonlyArray<Readonly<{ path: string; openable: boolean; side: ResolutionSide | undefined }>>;
  busy: boolean;
  finishing: boolean;
  /** Every path has a side, so the merge can be asked for again. */
  ready: boolean;
}> => {
  const { context } = snapshot;
  return {
    revisionId: context.revisionId,
    branch: context.branch,
    labels: context.labels,
    paths: context.paths.map((entry) => ({
      path: entry.path,
      openable: entry.openable,
      side: context.chosen[entry.path],
    })),
    busy:
      snapshot.matches({ open: 'loading' }) ||
      snapshot.matches({ resolving: 'applying' }) ||
      snapshot.matches({ resolving: 'materializing' }) ||
      snapshot.matches({ resolving: 'seeding' }) ||
      snapshot.matches('finishing'),
    finishing: snapshot.matches('finishing'),
    ready: context.paths.length > 0 && context.paths.every((entry) => context.chosen[entry.path] !== undefined),
  };
};

/**
 * The actor set a host provides for `resolutionMachine`.
 *
 * @public
 */
export type ResolutionActors = NonNullable<Parameters<typeof resolutionMachine.provide>[0]['actors']>;
