/**
 * `branch.machine` — the branch verbs a person drives: *Switch*, *Merge into
 * `<current>`*, *Discard*, *New branch* and *Rename*.
 *
 * One per project, invoked by `project-revisions.machine` for the root's whole
 * life (A38). It replaces the provider's `checkout`/`mergeBranch`/`deleteBranch`
 * promises and the pane's `isBusy` flag: every verb is a state, every effect has
 * a failure edge, and `confirming` exists only for the cases where D10 needs a
 * person (a *Switch* that would overwrite unsaved work, a *Discard* that would
 * drop it).
 *
 * Two of the five verbs are **not** its own effects. *New branch* and *Discard*
 * are the checkout registry's `addCheckout`/`removeCheckout` — one writer of the
 * registry, not two — so this machine sends them to the parent and waits for the
 * registry's own answer (`branchesChanged` / `operationFailed`) under a bound.
 * That is the A38 sibling rule: children address siblings through the parent.
 *
 * The selection itself is the **root's**: the root holds the lease set, so the
 * root resolves D10 (`switchResolved { mode }`) and re-roots the workbench. What
 * arrives here is the half that has an effect — applying `head(branch)` to the
 * live checkout — which is the choreography `packages/host/src/revisions.ts`
 * currently hand-rolls over the `restore` child.
 */

import { assign, emit, enqueueActions, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

/** How long a delegated registry verb waits for the registry's answer. @public */
export const branchRegistryMilliseconds = 30_000;

/** The five verbs this machine owns. @public */
export type BranchOperation = 'switch' | 'merge' | 'discard' | 'create' | 'rename';

/** Input accepted when creating the branchMachine actor. @public */
export type BranchMachineInput = Readonly<{
  projectId: string;
  /** The branch the workbench is on; *Merge into `<current>`* names it. */
  currentBranch?: string;
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by branchMachine. @public */
export type BranchMachineContext = Readonly<{
  projectId: string;
  currentBranch: string | undefined;
  /** The verb in flight, or `undefined` while idle. */
  operation: BranchOperation | undefined;
  /** The branch the verb acts on; for `create` it is the name being created. */
  branch: string | undefined;
  /** The new name a `rename` writes. */
  name: string | undefined;
  /** Where a created branch starts, when the caller named a revision. */
  from: string | undefined;
  /** How the root resolved a *Switch* (D10). */
  mode: 'reroot' | 'applyToLive' | undefined;
  /** The checkout a *Switch* or *Discard* acts on, once known. */
  checkoutId: string | undefined;
  /** Whether the checked verb needs a person before it runs. */
  needsConfirmation: boolean;
  /** What the confirmation says, in the words `checkBranch` chose. */
  question: string | undefined;
  reason: string | undefined;
  /** Paths a merge could not settle; W10's resolution reads them. */
  conflicts: readonly string[];
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by branchMachine. @public */
export type BranchMachineEvent =
  /** Apply `head(branch)` to the live checkout — the root already resolved D10. */
  | Readonly<{ type: 'switch'; branch: string; mode?: 'reroot' | 'applyToLive'; checkoutId?: string }>
  | Readonly<{ type: 'merge'; branch: string }>
  | Readonly<{ type: 'discard'; branch: string; checkoutId?: string }>
  | Readonly<{ type: 'create'; name: string; from?: string }>
  | Readonly<{ type: 'rename'; branch: string; name: string }>
  | Readonly<{ type: 'confirm' }>
  | Readonly<{ type: 'cancel' }>
  /** The workbench moved; *Merge into `<current>`* follows it. */
  | Readonly<{ type: 'selectBranch'; branch: string | undefined }>
  /** The registry answered a delegated verb: the branch set as it now stands. */
  | Readonly<{ type: 'branchesChanged'; branches: readonly string[] }>
  /** The registry refused a delegated verb. */
  | Readonly<{ type: 'operationFailed'; reason: string }>;

/** Facts branchMachine emits, and sends to its parent when they move a checkout. @public */
export type BranchMachineEmitted =
  | Readonly<{
      type: 'checkoutChanged';
      checkoutId: string;
      revisionId: string;
      treeId: string;
      branch: string | undefined;
    }>
  | Readonly<{ type: 'branchMerged'; branch: string; into: string; revisionId: string }>
  | Readonly<{ type: 'mergeConflicted'; branch: string; into: string; paths: readonly string[] }>
  | Readonly<{ type: 'toast.branch'; operation: BranchOperation; branch: string }>
  | Readonly<{ type: 'toast.error'; message: string }>;

/**
 * What `checkBranch` answers before a verb runs.
 *
 * The two facts a guard needs, and the sentence a confirmation shows. The
 * machine never re-derives the question, because the host is the only thing
 * that knows what the tree looks like.
 *
 * @public
 */
export type BranchCheckActorOutput = Readonly<{
  needsConfirmation: boolean;
  /** The confirmation's own words; ignored when nothing is asked. */
  question?: string;
  /** The checkout the verb acts on, when the host resolved one. */
  checkoutId?: string;
  /** How a *Switch* lands (D10), when the caller did not say. */
  mode?: 'reroot' | 'applyToLive';
}>;

/** Input of the injected `checkBranch` actor. @public */
export type BranchCheckActorInput = Readonly<{
  projectId: string;
  operation: BranchOperation;
  branch: string;
  /** The branch a merge lands on. */
  into?: string;
}>;

/** Output of the injected `applySwitch` actor. @public */
export type BranchApplySwitchActorOutput = Readonly<{
  checkoutId: string;
  revisionId: string;
  treeId: string;
  branch: string | undefined;
}>;

/**
 * Output of the injected `merge` actor.
 *
 * A conflicted merge is an **outcome**, not a rejection: both branches are kept
 * and the paths ride out to W10's resolution (A25 — the merge never touches the
 * checkout when it cannot settle).
 *
 * @public
 */
export type BranchMergeActorOutput =
  | Readonly<{ status: 'merged'; revisionId: string }>
  | Readonly<{ status: 'conflicted'; paths: readonly string[] }>;

/** Output of the injected `rename` actor. @public */
export type BranchRenameActorOutput = Readonly<{ branch: string }>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'That branch change failed.';

/**
 * Headless branch verbs for one project.
 *
 * @public
 */
export const branchMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as BranchMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as BranchMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as BranchMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as BranchMachineInput,
  },
  actors: {
    /*
     * The one effect with a default: a host that has nothing to ask asks
     * nothing. The gates themselves are not here — the registry refuses a
     * removal a lease holds and the port refuses one whose tree has changes
     * that are not in a revision yet (A25) — so an unprovided check can only
     * cost a confirmation, never a file.
     */
    checkBranch: fromPromise<BranchCheckActorOutput, BranchCheckActorInput>(async () => ({
      needsConfirmation: false,
    })),
    applySwitch: fromPromise<
      BranchApplySwitchActorOutput,
      Readonly<{ projectId: string; branch: string; checkoutId: string | undefined }>
    >(async () => {
      throw new Error('branchMachine: the applySwitch actor was not provided.');
    }),
    merge: fromPromise<BranchMergeActorOutput, Readonly<{ projectId: string; branch: string; into: string }>>(
      async () => {
        throw new Error('branchMachine: the merge actor was not provided.');
      },
    ),
    rename: fromPromise<BranchRenameActorOutput, Readonly<{ projectId: string; branch: string; name: string }>>(
      async () => {
        throw new Error('branchMachine: the rename actor was not provided.');
      },
    ),
  },
  guards: {
    needsConfirmation: ({ context }) => context.needsConfirmation,
    isOperation: ({ context }, params: Readonly<{ operation: BranchOperation }>) =>
      context.operation === params.operation,
  },
  actions: {
    clearTransient: assign({
      operation: undefined,
      branch: undefined,
      name: undefined,
      from: undefined,
      mode: undefined,
      checkoutId: undefined,
      needsConfirmation: false,
      question: undefined,
      conflicts: [],
    }),
    /* The registry is one writer (`checkouts.machine`); this asks it through the
     * parent rather than opening a second path to the same records (A38). */
    delegate: enqueueActions(({ context, enqueue }, params: Readonly<{ type: 'addCheckout' | 'removeCheckout' }>) => {
      if (context.parentRef === undefined) {
        enqueue.raise({ type: 'operationFailed', reason: 'This project has no registry to ask.' });
        return;
      }
      enqueue.sendTo(
        context.parentRef,
        params.type === 'addCheckout'
          ? { type: 'addCheckout', branch: context.branch ?? '', from: context.from ?? '' }
          : { type: 'removeCheckout', id: context.checkoutId ?? '' },
      );
    }),
    failWith: assign({ reason: (_, params: Readonly<{ reason: string }>) => params.reason }),
  },
}).createMachine({
  id: 'branch',
  context: ({ input }) => ({
    projectId: input.projectId,
    currentBranch: input.currentBranch,
    operation: undefined,
    branch: undefined,
    name: undefined,
    from: undefined,
    mode: undefined,
    checkoutId: undefined,
    needsConfirmation: false,
    question: undefined,
    reason: undefined,
    conflicts: [],
    parentRef: input.parentRef,
  }),
  on: {
    selectBranch: { actions: assign({ currentBranch: ({ event }) => event.branch }) },
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        switch: {
          target: 'checking',
          actions: assign({
            operation: 'switch',
            branch: ({ event }) => event.branch,
            mode: ({ event }) => event.mode,
            checkoutId: ({ event }) => event.checkoutId,
            reason: undefined,
          }),
        },
        merge: {
          target: 'checking',
          actions: assign({ operation: 'merge', branch: ({ event }) => event.branch, reason: undefined }),
        },
        discard: {
          target: 'checking',
          actions: assign({
            operation: 'discard',
            branch: ({ event }) => event.branch,
            checkoutId: ({ event }) => event.checkoutId,
            reason: undefined,
          }),
        },
        create: {
          target: 'checking',
          actions: assign({
            operation: 'create',
            branch: ({ event }) => event.name,
            from: ({ event }) => event.from,
            reason: undefined,
          }),
        },
        rename: {
          target: 'checking',
          actions: assign({
            operation: 'rename',
            branch: ({ event }) => event.branch,
            name: ({ event }) => event.name,
            reason: undefined,
          }),
        },
      },
    },
    checking: {
      invoke: {
        src: 'checkBranch',
        input: ({ context }) => ({
          projectId: context.projectId,
          operation: context.operation ?? 'switch',
          branch: context.branch ?? '',
          ...(context.currentBranch === undefined ? {} : { into: context.currentBranch }),
        }),
        onDone: {
          target: 'checked',
          actions: assign({
            needsConfirmation: ({ event }) => event.output.needsConfirmation,
            question: ({ event }) => event.output.question,
            checkoutId: ({ context, event }) => event.output.checkoutId ?? context.checkoutId,
            mode: ({ context, event }) => event.output.mode ?? context.mode,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
        },
      },
    },
    checked: {
      always: [{ guard: 'needsConfirmation', target: 'confirming' }, { target: 'applying' }],
    },
    confirming: {
      on: {
        confirm: { target: 'applying' },
        cancel: { target: 'idle', actions: 'clearTransient' },
      },
    },
    applying: {
      initial: 'routing',
      states: {
        routing: {
          always: [
            { guard: { type: 'isOperation', params: { operation: 'merge' } }, target: 'merging' },
            { guard: { type: 'isOperation', params: { operation: 'create' } }, target: 'creating' },
            { guard: { type: 'isOperation', params: { operation: 'discard' } }, target: 'discarding' },
            { guard: { type: 'isOperation', params: { operation: 'rename' } }, target: 'renaming' },
            { target: 'switching' },
          ],
        },
        switching: {
          invoke: {
            src: 'applySwitch',
            input: ({ context }) => ({
              projectId: context.projectId,
              branch: context.branch ?? '',
              checkoutId: context.checkoutId,
            }),
            onDone: {
              target: '#branch.applied',
              actions: enqueueActions(({ context, enqueue, event }) => {
                const fact: BranchMachineEmitted = {
                  type: 'checkoutChanged',
                  checkoutId: event.output.checkoutId,
                  revisionId: event.output.revisionId,
                  treeId: event.output.treeId,
                  branch: event.output.branch,
                };
                enqueue.emit(fact);
                if (context.parentRef !== undefined) {
                  enqueue.sendTo(context.parentRef, fact);
                }
              }),
            },
            onError: {
              target: '#branch.failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
        merging: {
          invoke: {
            src: 'merge',
            input: ({ context }) => ({
              projectId: context.projectId,
              branch: context.branch ?? '',
              into: context.currentBranch ?? '',
            }),
            onDone: [
              {
                /* Both branches are kept and the checkout is untouched; the
                 * paths are W10's to resolve. */
                guard: ({ event }) => event.output.status === 'conflicted',
                target: '#branch.conflicted',
                actions: assign({
                  conflicts: ({ event }) => (event.output.status === 'conflicted' ? event.output.paths : []),
                }),
              },
              {
                target: '#branch.applied',
                actions: emit(
                  ({ context, event }): BranchMachineEmitted => ({
                    type: 'branchMerged',
                    branch: context.branch ?? '',
                    into: context.currentBranch ?? '',
                    revisionId: event.output.status === 'merged' ? event.output.revisionId : '',
                  }),
                ),
              },
            ],
            onError: {
              target: '#branch.failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
        /* The registry's own verbs, asked through the parent. The bound is the
         * failure edge every invoked effect has — a registry that never answers
         * must not leave the pane's verbs disabled forever. */
        creating: {
          entry: { type: 'delegate', params: { type: 'addCheckout' } },
          after: {
            [branchRegistryMilliseconds]: {
              target: '#branch.failed',
              actions: { type: 'failWith', params: { reason: 'This project did not answer in time.' } },
            },
          },
          on: {
            branchesChanged: {
              guard: ({ context, event }) => event.branches.includes(context.branch ?? ''),
              target: '#branch.applied',
            },
            operationFailed: {
              target: '#branch.failed',
              actions: assign({ reason: ({ event }) => event.reason }),
            },
          },
        },
        discarding: {
          entry: { type: 'delegate', params: { type: 'removeCheckout' } },
          after: {
            [branchRegistryMilliseconds]: {
              target: '#branch.failed',
              actions: { type: 'failWith', params: { reason: 'This project did not answer in time.' } },
            },
          },
          on: {
            branchesChanged: {
              guard: ({ context, event }) => !event.branches.includes(context.branch ?? ''),
              target: '#branch.applied',
            },
            operationFailed: {
              target: '#branch.failed',
              actions: assign({ reason: ({ event }) => event.reason }),
            },
          },
        },
        renaming: {
          invoke: {
            src: 'rename',
            input: ({ context }) => ({
              projectId: context.projectId,
              branch: context.branch ?? '',
              name: context.name ?? '',
            }),
            onDone: {
              target: '#branch.applied',
              actions: assign({ branch: ({ event }) => event.output.branch }),
            },
            onError: {
              target: '#branch.failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
      },
    },
    applied: {
      entry: emit(
        ({ context }): BranchMachineEmitted => ({
          type: 'toast.branch',
          operation: context.operation ?? 'switch',
          branch: context.branch ?? '',
        }),
      ),
      always: { target: 'idle', actions: 'clearTransient' },
    },
    conflicted: {
      /* The fact goes to the parent as well as out, exactly as `applySwitch`'s
       * `checkoutChanged` does: a conflicted merge moved the source branch, so
       * the registry is stale and nothing else would ever say so. Without this
       * send the conflict is real in the graph and invisible on the screen
       * until the project is reopened (W10 review R1, P41). */
      entry: enqueueActions(({ context, enqueue }) => {
        const fact: BranchMachineEmitted = {
          type: 'mergeConflicted',
          branch: context.branch ?? '',
          into: context.currentBranch ?? '',
          paths: context.conflicts,
        };
        enqueue.emit(fact);
        if (context.parentRef !== undefined) {
          enqueue.sendTo(context.parentRef, fact);
        }
      }),
      always: { target: 'idle', actions: 'clearTransient' },
    },
    failed: {
      entry: emit(
        ({ context }): BranchMachineEmitted => ({
          type: 'toast.error',
          message: context.reason ?? 'That branch change failed.',
        }),
      ),
      always: { target: 'idle', actions: 'clearTransient' },
    },
  },
});

/**
 * Selects whether a branch verb is waiting for the user to confirm it.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the machine is confirming.
 * @public
 */
export const selectBranchNeedsConfirmation = (snapshot: SnapshotFrom<typeof branchMachine>): boolean =>
  snapshot.matches('confirming');

/**
 * Selects whether a branch verb is running right now.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the machine is checking or applying.
 * @public
 */
export const selectBranchBusy = (snapshot: SnapshotFrom<typeof branchMachine>): boolean =>
  snapshot.matches('checking') || snapshot.matches('applying');

/**
 * The facet the Revisions pane reads about the verb in flight.
 *
 * @param snapshot - Current machine snapshot.
 * @returns What is running, what is being asked, and about which branch.
 * @public
 */
export const selectBranchFacet = (
  snapshot: SnapshotFrom<typeof branchMachine>,
): Readonly<{
  busy: boolean;
  asking: boolean;
  operation: BranchOperation | undefined;
  branch: string | undefined;
  question: string | undefined;
}> => ({
  busy: selectBranchBusy(snapshot),
  asking: selectBranchNeedsConfirmation(snapshot),
  operation: snapshot.context.operation,
  branch: snapshot.context.branch,
  question: snapshot.context.question,
});

/**
 * The actor set a host provides for `branchMachine`.
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host.
 *
 * @public
 */
export type BranchActors = NonNullable<Parameters<typeof branchMachine.provide>[0]['actors']>;
