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

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SnapshotFrom } from 'xstate';

import type { CheckoutCutTrigger } from '#checkout.machine.js';
import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import type { RevisionPortErrorCode } from '#revision-port.js';

/** How long a delegated registry verb waits for the registry's answer. @public */
export const branchRegistryMilliseconds = 30_000;

/**
 * What refused a branch verb.
 *
 * A port code where the port refused, plus the two refusals a *New branch* can
 * meet that no port names: the head moved under the cut it asked for (the
 * `TurnFailureCode` shape, one verb over), and the cut named nothing this
 * project is standing in — which is not a name collision, so it is not
 * `CHECKOUT_CONFLICT`.
 *
 * @public
 */
export type BranchFailureCode = RevisionPortErrorCode | 'CAS_LOST' | 'CHECKOUT_UNKNOWN';

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
  reasonCode: BranchFailureCode | undefined;
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
  | Readonly<{
      type: 'cutFailed';
      /** Undefined when the cut named a checkout this project does not have. */
      checkoutId: string | undefined;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      reason: string;
      code?: BranchFailureCode;
    }>
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
  /* P4: a refusal crosses as a code; the page owns the words. The verb and its
   * branch ride along, because a caller correlating one *New branch* must not
   * take an unrelated verb's refusal for its own (review finding 1). */
  | Readonly<{
      type: 'toast.error';
      operation?: BranchOperation;
      branch?: string;
      message: string;
      code?: BranchFailureCode;
    }>;

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

type BranchEnqueue = EnqueueObject<BranchMachineEvent, BranchMachineEmitted>;

const clearTransient = {
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
} satisfies Partial<BranchMachineContext>;

/* The registry is one writer (`checkouts.machine`); this asks it through the
 * parent rather than opening a second path to the same records (A38). */
const delegate = (
  context: BranchMachineContext,
  enq: BranchEnqueue,
  type: 'addCheckout' | 'removeCheckout' | 'cut',
): void => {
  if (context.parentRef === undefined) {
    enq.raise({ type: 'operationFailed', reason: 'This project has no registry to ask.' });
    return;
  }
  /* `cut` is the same delegation one level over: the checkout is the sole
   * minter (F2), so a *New branch* asks the root to record rather than
   * minting a revision of its own (P3). */
  enq.sendTo(
    context.parentRef,
    type === 'addCheckout'
      ? { type: 'addCheckout', branch: context.branch ?? '', from: context.from ?? '' }
      : type === 'removeCheckout'
        ? { type: 'removeCheckout', id: context.checkoutId ?? '' }
        : { type: 'cut', trigger: 'switch', checkoutId: context.checkoutId, leaseIds: [] },
  );
};

const failFromRegistry = (event: Extract<BranchMachineEvent, { type: 'operationFailed' }>) => ({
  reason: event.reason,
  reasonCode: event.code,
});

const failWith = (reason: string, code?: BranchFailureCode) => ({ reason, reasonCode: code });

const failFromError = (error: unknown) => ({
  reason: describeFailure(error),
  reasonCode: describeFailureCode(error),
});

const registryTimeout = { target: '#branch.failed', context: failWith('This project did not answer in time.') };

/**
 * Headless branch verbs for one project.
 *
 * @public
 */
export const branchMachine = setup({
  schemas: {
    context: types<BranchMachineContext>(),
    events: eventSchemas<BranchMachineEvent>(),
    emitted: eventSchemas<BranchMachineEmitted>(),
    input: types<BranchMachineInput>(),
  },
  actors: {
    /*
     * The one effect with a default: a host that has nothing to ask asks
     * nothing. The gates themselves are not here — the registry refuses a
     * removal a lease holds and the port refuses one whose tree has changes
     * that are not in a revision yet (A25) — so an unprovided check can only
     * cost a confirmation, never a file.
     */
    checkBranch: createAsyncLogic<BranchCheckActorOutput, BranchCheckActorInput>({
      run: async () => ({
        needsConfirmation: false,
      }),
    }),
    applySwitch: createAsyncLogic<
      BranchApplySwitchActorOutput,
      Readonly<{ projectId: string; branch: string; checkoutId: string | undefined }>
    >({
      run: async () => {
        throw new Error('branchMachine: the applySwitch actor was not provided.');
      },
    }),
    merge: createAsyncLogic<BranchMergeActorOutput, Readonly<{ projectId: string; branch: string; into: string }>>({
      run: async () => {
        throw new Error('branchMachine: the merge actor was not provided.');
      },
    }),
    rename: createAsyncLogic<BranchRenameActorOutput, Readonly<{ projectId: string; branch: string; name: string }>>({
      run: async () => {
        throw new Error('branchMachine: the rename actor was not provided.');
      },
    }),
  },
  guards: {
    hasBase: (context: BranchMachineContext) => context.from !== undefined && context.from !== '',
    hasHead: (context: BranchMachineContext) => context.head !== undefined,
    /* This verb's own cut: a turn's belongs to that turn (a2 R1), another
     * checkout's to nobody here, and an ambient `save`/`idle`/`hidden`/`close`
     * on this same checkout carries no turn id either — so the trigger is what
     * separates the answer asked for from the one that merely arrived. */
    answersOurCut: (context: BranchMachineContext, event: BranchMachineEvent) =>
      (event.type === 'revisionMinted' ||
        event.type === 'nothingToSave' ||
        event.type === 'cutFailed' ||
        event.type === 'casLost') &&
      event.turnId === undefined &&
      event.trigger === 'switch' &&
      event.checkoutId === context.checkoutId,
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
    selectBranch: { context: ({ event }) => ({ currentBranch: event.branch }) },
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        switch: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'switch',
            branch: event.branch,
            mode: event.mode,
            checkoutId: event.checkoutId,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        merge: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'merge',
            branch: event.branch,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        discard: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'discard',
            branch: event.branch,
            checkoutId: event.checkoutId,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        create: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'create',
            branch: event.name,
            from: event.from,
            checkoutId: event.checkoutId,
            head: event.head,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        rename: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'rename',
            branch: event.branch,
            name: event.name,
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
          context: ({ context, event }) => ({
            needsConfirmation: event.output.needsConfirmation,
            question: event.output.question,
            checkoutId: event.output.checkoutId ?? context.checkoutId,
            mode: event.output.mode ?? context.mode,
          }),
        },
        onError: {
          target: 'failed',
          context: ({ event }) => failFromError(event.error),
        },
      },
    },
    checked: {
      always: ({ context }) => (context.needsConfirmation ? { target: 'confirming' } : { target: 'applying' }),
    },
    confirming: {
      on: {
        confirm: { target: 'applying' },
        cancel: { target: 'idle', context: clearTransient },
      },
    },
    applying: {
      initial: 'routing',
      states: {
        routing: {
          always: ({ context }) => {
            switch (context.operation) {
              case 'merge': {
                return { target: 'merging' };
              }
              case 'create': {
                return { target: 'creating' };
              }
              case 'discard': {
                return { target: 'discarding' };
              }
              case 'rename': {
                return { target: 'renaming' };
              }
              default: {
                return { target: 'switching' };
              }
            }
          },
        },
        switching: {
          invoke: {
            src: 'applySwitch',
            input: ({ context }) => ({
              projectId: context.projectId,
              branch: context.branch ?? '',
              checkoutId: context.checkoutId,
            }),
            onDone: ({ context, event }, enq) => {
              const fact: BranchMachineEmitted = {
                type: 'checkoutChanged',
                checkoutId: event.output.checkoutId,
                revisionId: event.output.revisionId,
                treeId: event.output.treeId,
                branch: event.output.branch,
              };
              enq.emit(fact);
              if (context.parentRef !== undefined) {
                enq.sendTo(context.parentRef, fact);
              }
              return { target: '#branch.applied' };
            },
            onError: {
              target: '#branch.failed',
              context: ({ event }) => failFromError(event.error),
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
            onDone: ({ context, event }, enq) => {
              /* Both branches are kept and the checkout is untouched; the
               * paths are W10's to resolve. */
              if (event.output.status === 'conflicted') {
                return { target: '#branch.conflicted', context: { conflicts: event.output.paths } };
              }
              const fact: BranchMachineEmitted = {
                type: 'branchMerged',
                branch: context.branch ?? '',
                into: context.currentBranch ?? '',
                revisionId: event.output.status === 'merged' ? event.output.revisionId : '',
              };
              enq.emit(fact);
              if (context.parentRef !== undefined) {
                enq.sendTo(context.parentRef, fact);
              }
              return { target: '#branch.applied' };
            },
            onError: {
              target: '#branch.failed',
              context: ({ event }) => failFromError(event.error),
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
              always: ({ context, guards }) =>
                guards.hasBase(context) ? { target: 'adding' } : { target: 'recording' },
            },
            recording: {
              entry: ({ context }, enq) => delegate(context, enq, 'cut'),
              after: {
                [branchRegistryMilliseconds]: registryTimeout,
              },
              on: {
                revisionMinted: ({ context, event, guards }) =>
                  guards.answersOurCut(context, event)
                    ? { target: 'adding', context: { from: event.revisionId } }
                    : undefined,
                nothingToSave: ({ context, event, guards }) => {
                  if (!guards.answersOurCut(context, event)) {
                    return undefined;
                  }
                  /* Nothing to record, but a head to stand on — which is also
                   * the answer a checkout an agent holds gives (a2 R1). */
                  if (guards.hasHead(context)) {
                    return { target: 'adding', context: { from: context.head } };
                  }
                  return {
                    target: '#branch.failed',
                    context: failWith('This project has nothing to branch from yet.', 'BRANCH_NEEDS_REVISION'),
                  };
                },
                cutFailed: ({ context, event, guards }) =>
                  guards.answersOurCut(context, event)
                    ? {
                        target: '#branch.failed',
                        context: {
                          reason: event.reason,
                          /* Whatever refused the cut named this; the page turns it
                             into words rather than falling back (P4). */
                          reasonCode: event.code,
                        },
                      }
                    : undefined,
                casLost: ({ context, event, guards }) =>
                  guards.answersOurCut(context, event)
                    ? {
                        target: '#branch.failed',
                        context: failWith('Something else changed this project first. Try again.', 'CAS_LOST'),
                      }
                    : undefined,
                operationFailed: {
                  target: '#branch.failed',
                  context: ({ event }) => failFromRegistry(event),
                },
              },
            },
            adding: {
              entry: ({ context }, enq) => delegate(context, enq, 'addCheckout'),
              after: {
                [branchRegistryMilliseconds]: registryTimeout,
              },
              on: {
                branchesChanged: ({ context, event }) => {
                  if (!event.branches.includes(context.branch ?? '')) {
                    return undefined;
                  }
                  /* The registry named the checkout it made; for a `create`
                   * that is what `toast.branch` carries out (P4). */
                  const record = event.checkouts?.find((entry) => entry.branch === context.branch);
                  return {
                    target: '#branch.applied',
                    context: {
                      checkoutId: record?.checkoutId ?? context.checkoutId,
                      checkoutRoot: record?.checkoutRoot,
                    },
                  };
                },
                operationFailed: {
                  target: '#branch.failed',
                  context: ({ event }) => failFromRegistry(event),
                },
              },
            },
          },
        },
        discarding: {
          entry: ({ context }, enq) => delegate(context, enq, 'removeCheckout'),
          after: {
            [branchRegistryMilliseconds]: registryTimeout,
          },
          on: {
            branchesChanged: ({ context, event }) =>
              event.branches.includes(context.branch ?? '') ? undefined : { target: '#branch.applied' },
            operationFailed: {
              target: '#branch.failed',
              context: ({ event }) => failFromRegistry(event),
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
              context: ({ event }) => ({ branch: event.output.branch }),
            },
            onError: {
              target: '#branch.failed',
              context: ({ event }) => failFromError(event.error),
            },
          },
        },
      },
    },
    applied: {
      entry: ({ context }, enq) => {
        enq.emit({
          type: 'toast.branch',
          operation: context.operation ?? 'switch',
          branch: context.branch ?? '',
          ...(context.checkoutRoot === undefined
            ? {}
            : { checkoutId: context.checkoutId, checkoutRoot: context.checkoutRoot }),
        });
      },
      always: { target: 'idle', context: clearTransient },
    },
    conflicted: {
      /* The fact goes to the parent as well as out, exactly as `applySwitch`'s
       * `checkoutChanged` does: a conflicted merge moved the source branch, so
       * the registry is stale and nothing else would ever say so. Without this
       * send the conflict is real in the graph and invisible on the screen
       * until the project is reopened (W10 review R1, P41). */
      entry: ({ context }, enq) => {
        const fact: BranchMachineEmitted = {
          type: 'mergeConflicted',
          branch: context.branch ?? '',
          into: context.currentBranch ?? '',
          paths: context.conflicts,
        };
        enq.emit(fact);
        if (context.parentRef !== undefined) {
          enq.sendTo(context.parentRef, fact);
        }
      },
      always: { target: 'idle', context: clearTransient },
    },
    failed: {
      entry: ({ context }, enq) => {
        enq.emit({
          type: 'toast.error',
          ...(context.operation === undefined ? {} : { operation: context.operation }),
          ...(context.branch === undefined ? {} : { branch: context.branch }),
          message: context.reason ?? 'That branch change failed.',
          ...(context.reasonCode === undefined ? {} : { code: context.reasonCode }),
        });
      },
      always: { target: 'idle', context: clearTransient },
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
export type BranchActors = MachineActors<typeof branchMachine>;
