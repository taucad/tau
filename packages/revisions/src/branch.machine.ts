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

import { and, assign, emit, enqueueActions, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

import type { CheckoutCutTrigger } from '#checkout.machine.js';
import type { RevisionPortErrorCode } from '#revision-port.js';

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
  /** Where a created branch starts, once the caller or a recorded cut named it. */
  from: string | undefined;
  /** The selected checkout's head, which a `create` falls back to (P3). */
  head: string | undefined;
  /** How the root resolved a *Switch* (D10). */
  mode: 'reroot' | 'applyToLive' | undefined;
  /**
   * The checkout the verb acts on, once known.
   *
   * For a *Switch* or *Discard* it is the one being moved or dropped; for a
   * *New branch* it is the selected checkout whose tree is recorded first, and
   * then the one the registry made (P3, P4).
   */
  checkoutId: string | undefined;
  /** Where that checkout's files are, once the registry named it. */
  checkoutRoot: string | undefined;
  /** Whether the checked verb needs a person before it runs. */
  needsConfirmation: boolean;
  /** What the confirmation says, in the words `checkBranch` chose. */
  question: string | undefined;
  reason: string | undefined;
  /** The refusal's stable category, when the thing that refused named one (P4). */
  reasonCode: RevisionPortErrorCode | undefined;
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
  /* `checkoutId` and `head` are the root's: only it knows where the person is
   * standing, and P3 makes a branch start from what they see. */
  | Readonly<{ type: 'create'; name: string; from?: string; checkoutId?: string; head?: string }>
  | Readonly<{ type: 'rename'; branch: string; name: string }>
  | Readonly<{ type: 'confirm' }>
  | Readonly<{ type: 'cancel' }>
  /** The workbench moved; *Merge into `<current>`* follows it. */
  | Readonly<{ type: 'selectBranch'; branch: string | undefined }>
  /** The registry answered a delegated verb: the branch set as it now stands. */
  | Readonly<{
      type: 'branchesChanged';
      branches: readonly string[];
      /** The same set as records, so a settled `create` knows what it made. */
      checkouts?: readonly BranchCheckoutRecord[];
    }>
  /** The registry refused a delegated verb. */
  | Readonly<{ type: 'operationFailed'; reason: string; code?: RevisionPortErrorCode }>
  /* The root's answers to the cut a `create` asks for. Only the trigger-only
   * ones reach here — a turn's cut is that turn's (a2 R1). */
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      revisionId: string;
    }>
  | Readonly<{ type: 'nothingToSave'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | Readonly<{ type: 'cutFailed'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string; reason: string }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>;

/** One checkout as the registry names it, beside the branch it tracks. @public */
export type BranchCheckoutRecord = Readonly<{ branch: string; checkoutId: string; checkoutRoot: string }>;

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
  | Readonly<{
      type: 'toast.branch';
      operation: BranchOperation;
      branch: string;
      /** What a `create` made, so a correlated caller needs no projection scrape. */
      checkoutId?: string;
      checkoutRoot?: string;
    }>
  /* P4: a refusal crosses as a code; the page owns the words. */
  | Readonly<{ type: 'toast.error'; message: string; code?: RevisionPortErrorCode }>;

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

/*
 * The port's own category, read structurally (P4).
 *
 * A machine may import only *types* from this package's contracts (I20, AC22),
 * so `instanceof RevisionPortError` is not available here; `sync.machine` reads
 * the same field the same way.
 */
const describeFailureCode = (error: unknown): RevisionPortErrorCode | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a rejection is `unknown` until read.
  const { code } = error as Readonly<{ code?: unknown }>;
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed to the port's own union.
  return typeof code === 'string' ? (code as RevisionPortErrorCode) : undefined;
};

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
    hasBase: ({ context }) => context.from !== undefined && context.from !== '',
    hasHead: ({ context }) => context.head !== undefined,
    /* Trigger-only, and about the checkout this verb asked to record: a turn's
     * cut belongs to that turn (a2 R1), and another checkout's to nobody here. */
    answersOurCut: ({ context, event }) =>
      (event.type === 'revisionMinted' ||
        event.type === 'nothingToSave' ||
        event.type === 'cutFailed' ||
        event.type === 'casLost') &&
      event.turnId === undefined &&
      event.checkoutId === context.checkoutId,
    isOperation: ({ context }, params: Readonly<{ operation: BranchOperation }>) =>
      context.operation === params.operation,
  },
  actions: {
    clearTransient: assign({
      operation: undefined,
      branch: undefined,
      name: undefined,
      from: undefined,
      head: undefined,
      mode: undefined,
      checkoutId: undefined,
      checkoutRoot: undefined,
      needsConfirmation: false,
      question: undefined,
      conflicts: [],
    }),
    /* The registry is one writer (`checkouts.machine`); this asks it through the
     * parent rather than opening a second path to the same records (A38). */
    delegate: enqueueActions(
      ({ context, enqueue }, params: Readonly<{ type: 'addCheckout' | 'removeCheckout' | 'cut' }>) => {
        if (context.parentRef === undefined) {
          enqueue.raise({ type: 'operationFailed', reason: 'This project has no registry to ask.' });
          return;
        }
        /* `cut` is the same delegation one level over: the checkout is the sole
         * minter (F2), so a *New branch* asks the root to record rather than
         * minting a revision of its own (P3). */
        enqueue.sendTo(
          context.parentRef,
          params.type === 'addCheckout'
            ? { type: 'addCheckout', branch: context.branch ?? '', from: context.from ?? '' }
            : params.type === 'removeCheckout'
              ? { type: 'removeCheckout', id: context.checkoutId ?? '' }
              : { type: 'cut', trigger: 'switch', checkoutId: context.checkoutId, leaseIds: [] },
        );
      },
    ),
    failFromRegistry: assign({
      reason: ({ event }) => (event.type === 'operationFailed' ? event.reason : 'That branch change failed.'),
      reasonCode: ({ event }) => (event.type === 'operationFailed' ? event.code : undefined),
    }),
    failWith: assign({
      reason: (_, params: Readonly<{ reason: string; code?: RevisionPortErrorCode }>) => params.reason,
      reasonCode: (_, params: Readonly<{ reason: string; code?: RevisionPortErrorCode }>) => params.code,
    }),
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
    head: undefined,
    mode: undefined,
    checkoutId: undefined,
    checkoutRoot: undefined,
    needsConfirmation: false,
    question: undefined,
    reason: undefined,
    reasonCode: undefined,
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
            reasonCode: undefined,
          }),
        },
        merge: {
          target: 'checking',
          actions: assign({
            operation: 'merge',
            branch: ({ event }) => event.branch,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        discard: {
          target: 'checking',
          actions: assign({
            operation: 'discard',
            branch: ({ event }) => event.branch,
            checkoutId: ({ event }) => event.checkoutId,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        create: {
          target: 'checking',
          actions: assign({
            operation: 'create',
            branch: ({ event }) => event.name,
            from: ({ event }) => event.from,
            checkoutId: ({ event }) => event.checkoutId,
            head: ({ event }) => event.head,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        rename: {
          target: 'checking',
          actions: assign({
            operation: 'rename',
            branch: ({ event }) => event.branch,
            name: ({ event }) => event.name,
            reason: undefined,
            reasonCode: undefined,
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
              actions: assign({
                reason: ({ event }) => describeFailure(event.error),
                reasonCode: ({ event }) => describeFailureCode(event.error),
              }),
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
                actions: enqueueActions(({ context, enqueue, event }) => {
                  const fact: BranchMachineEmitted = {
                    type: 'branchMerged',
                    branch: context.branch ?? '',
                    into: context.currentBranch ?? '',
                    revisionId: event.output.status === 'merged' ? event.output.revisionId : '',
                  };
                  enqueue.emit(fact);
                  if (context.parentRef !== undefined) {
                    enqueue.sendTo(context.parentRef, fact);
                  }
                }),
              },
            ],
            onError: {
              target: '#branch.failed',
              actions: assign({
                reason: ({ event }) => describeFailure(event.error),
                reasonCode: ({ event }) => describeFailureCode(event.error),
              }),
            },
          },
        },
        /* The registry's own verbs, asked through the parent. The bound is the
         * failure edge every invoked effect has — a registry that never answers
         * must not leave the pane's verbs disabled forever. */
        /*
         * P3: a branch starts from what the person sees.
         *
         * `recording` asks the root to cut the selected checkout, so unsaved
         * edits are in the tree the branch starts from; `adding` is the
         * delegated registry verb. A caller that named a base has already
         * chosen one and skips straight to `adding`.
         */
        creating: {
          initial: 'routing',
          states: {
            routing: {
              always: [{ guard: 'hasBase', target: 'adding' }, { target: 'recording' }],
            },
            recording: {
              entry: { type: 'delegate', params: { type: 'cut' } },
              after: {
                [branchRegistryMilliseconds]: {
                  target: '#branch.failed',
                  actions: { type: 'failWith', params: { reason: 'This project did not answer in time.' } },
                },
              },
              on: {
                revisionMinted: {
                  guard: { type: 'answersOurCut' },
                  target: 'adding',
                  actions: assign({ from: ({ event }) => event.revisionId }),
                },
                nothingToSave: [
                  {
                    /* Nothing to record, but a head to stand on — which is also
                     * the answer a checkout an agent holds gives (a2 R1). */
                    guard: and(['answersOurCut', 'hasHead']),
                    target: 'adding',
                    actions: assign({ from: ({ context }) => context.head }),
                  },
                  {
                    guard: { type: 'answersOurCut' },
                    target: '#branch.failed',
                    actions: {
                      type: 'failWith',
                      params: {
                        reason: 'This project has nothing to branch from yet.',
                        code: 'BRANCH_NEEDS_REVISION',
                      },
                    },
                  },
                ],
                cutFailed: {
                  guard: { type: 'answersOurCut' },
                  target: '#branch.failed',
                  actions: assign({ reason: ({ event }) => event.reason }),
                },
                casLost: {
                  guard: { type: 'answersOurCut' },
                  target: '#branch.failed',
                  actions: {
                    type: 'failWith',
                    params: { reason: 'Something else changed this project first. Try again.' },
                  },
                },
                operationFailed: {
                  target: '#branch.failed',
                  actions: 'failFromRegistry',
                },
              },
            },
            adding: {
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
                  /* The registry named the checkout it made; for a `create`
                   * that is what `toast.branch` carries out (P4). */
                  actions: assign({
                    checkoutId: ({ context, event }) =>
                      event.checkouts?.find((record) => record.branch === context.branch)?.checkoutId ??
                      context.checkoutId,
                    checkoutRoot: ({ context, event }) =>
                      event.checkouts?.find((record) => record.branch === context.branch)?.checkoutRoot,
                  }),
                },
                operationFailed: {
                  target: '#branch.failed',
                  actions: 'failFromRegistry',
                },
              },
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
              actions: 'failFromRegistry',
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
              actions: assign({
                reason: ({ event }) => describeFailure(event.error),
                reasonCode: ({ event }) => describeFailureCode(event.error),
              }),
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
          ...(context.checkoutRoot === undefined
            ? {}
            : { checkoutId: context.checkoutId, checkoutRoot: context.checkoutRoot }),
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
          ...(context.reasonCode === undefined ? {} : { code: context.reasonCode }),
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
