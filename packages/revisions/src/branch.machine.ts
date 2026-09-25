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
 * registry's own answer (`checkoutAdded`, `checkoutRemoved` or `operationFailed`)
 * by request id. That is the A38 sibling rule: children address siblings through
 * the parent.
 *
 * Every verb that starts work names its request, and every answer echoes it
 * (RM-R1). A verb that arrives while another runs or waits for a person is
 * refused `REVISIONS_BUSY`, never dropped (RM-R11); no bound waits for a peer
 * (RM-R3).
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
import type { BranchOperation } from '#branch.types.js';

/**
 * How long a delegated registry verb used to wait for the registry's answer.
 *
 * No machine reads it since the registry answers by request id (RM-S8); it
 * stays exported while outside waiters import it, and goes with them (W8 TS-S5).
 *
 * @public
 */
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
export type BranchFailureCode = RevisionPortErrorCode | 'CAS_LOST' | 'CHECKOUT_UNKNOWN' | 'REVISIONS_BUSY';

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
  /** The id the verb in flight was asked under; its answer echoes it (RM-R1). */
  requestId: string | undefined;
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
  | Readonly<{
      type: 'switch';
      requestId: string;
      branch: string;
      mode?: 'reroot' | 'applyToLive';
      checkoutId?: string;
    }>
  | Readonly<{ type: 'merge'; requestId: string; branch: string }>
  | Readonly<{ type: 'discard'; requestId: string; branch: string; checkoutId?: string }>
  /* `checkoutId` and `head` are the root's: only it knows where the person is
   * standing, and P3 makes a branch start from what they see. */
  | Readonly<{ type: 'create'; requestId: string; name: string; from?: string; checkoutId?: string; head?: string }>
  | Readonly<{ type: 'rename'; requestId: string; branch: string; name: string }>
  /* `confirm` and `cancel` continue the pending verb and carry no id of their own. */
  | Readonly<{ type: 'confirm' }>
  | Readonly<{ type: 'cancel' }>
  /** The workbench moved; *Merge into `<current>`* follows it. */
  | Readonly<{ type: 'selectBranch'; branch: string | undefined }>
  /** The registry made the checkout a `create` asked for. */
  | Readonly<{ type: 'checkoutAdded'; requestId: string; checkoutId: string; checkoutRoot: string }>
  /** The registry dropped the checkout a `discard` asked it to. */
  | Readonly<{ type: 'checkoutRemoved'; requestId: string }>
  /** The registry refused a delegated verb. */
  | Readonly<{ type: 'operationFailed'; requestId?: string; reason: string; code?: RevisionPortErrorCode }>
  /* The root's answers to cuts no turn asked for; the one a `create` asked for echoes its id (RM-R1). */
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      requestId?: string;
      revisionId: string;
    }>
  | Readonly<{ type: 'nothingToSave'; checkoutId: string; trigger: CheckoutCutTrigger; requestId?: string }>
  | Readonly<{
      type: 'cutFailed';
      /** Undefined when the cut named a checkout this project does not have. */
      checkoutId: string | undefined;
      trigger: CheckoutCutTrigger;
      requestId?: string;
      reason: string;
      code?: BranchFailureCode;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; requestId?: string }>;

/** Facts branchMachine emits, and sends to its parent when they move a checkout. @public */
export type BranchMachineEmitted =
  /* A hint that this checkout moved: the root has the checkout re-read (RM-R5). A rename names no head. */
  | Readonly<{
      type: 'checkoutChanged';
      checkoutId: string;
      revisionId?: string;
      treeId?: string;
      branch?: string | undefined;
    }>
  | Readonly<{ type: 'branchMerged'; branch: string; into: string; revisionId: string }>
  | Readonly<{ type: 'mergeConflicted'; branch: string; into: string; paths: readonly string[] }>
  | Readonly<{
      type: 'toast.branch';
      /** The id the verb was asked under (RM-R1). */
      requestId: string;
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
      /** The id the refused verb was asked under; a busy refusal names the verb it refused (RM-R11). */
      requestId: string;
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

/** Output of the injected `rename` actor: the new name, and the checkout whose HEAD it moved, if any (RM-R5). @public */
export type BranchRenameActorOutput = Readonly<{ branch: string; checkoutId?: string }>;

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
  requestId: undefined,
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
  enq.sendTo(context.parentRef, delegation(context, type));
};

/* The ids a delegated request is asked under, derived from the verb's own (RM-R1). */
const delegatedId = (context: BranchMachineContext, type: 'add' | 'remove' | 'cut'): string =>
  `${context.requestId ?? ''}/${type}`;

const delegation = (context: BranchMachineContext, type: 'addCheckout' | 'removeCheckout' | 'cut') =>
  type === 'addCheckout'
    ? {
        type: 'addCheckout',
        requestId: delegatedId(context, 'add'),
        branch: context.branch ?? '',
        from: context.from ?? '',
      }
    : type === 'removeCheckout'
      ? { type: 'removeCheckout', requestId: delegatedId(context, 'remove'), id: context.checkoutId ?? '' }
      : {
          type: 'cut',
          requestId: delegatedId(context, 'cut'),
          trigger: 'switch',
          checkoutId: context.checkoutId,
          leaseIds: [],
        };

type StartVerb = Extract<BranchMachineEvent, { type: 'switch' | 'merge' | 'discard' | 'create' | 'rename' }>;

/* RM-R11: a verb that cannot start now is answered, never dropped; the page phrases the code. */
const refuseBusy = (enq: BranchEnqueue, event: StartVerb): void => {
  enq.emit({
    type: 'toast.error',
    requestId: event.requestId,
    operation: event.type,
    branch: event.type === 'create' ? event.name : event.branch,
    message: 'Another branch change is still running.',
    code: 'REVISIONS_BUSY',
  });
};

/* A change of HEAD the root has the checkout re-read (RM-R5). */
const reportMove = (context: BranchMachineContext, enq: BranchEnqueue, fact: BranchMachineEmitted): void => {
  enq.emit(fact);
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, fact);
  }
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

const branchMachineDefinition = setup({
  schemas: {
    context: types<BranchMachineContext>(),
    events: eventSchemas<BranchMachineEvent>(),
    emitted: eventSchemas<BranchMachineEmitted>(),
    input: types<BranchMachineInput>(),
    /* MC-R28: `busy` while a verb runs, `asking` while it waits for a person. */
    tags: types<'busy' | 'asking'>(),
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
    /* An answer is this verb's when it echoes the id this verb delegated under (RM-R1). */
    answersUs: (context: BranchMachineContext, requestId: string | undefined, type: 'add' | 'remove' | 'cut') =>
      requestId !== undefined && requestId === delegatedId(context, type),
  },
}).createMachine({
  id: 'branch',
  context: ({ input }) => ({
    projectId: input.projectId,
    currentBranch: input.currentBranch,
    operation: undefined,
    requestId: undefined,
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
    /* RM-R11: every state but `idle` refuses a verb it cannot start. */
    switch: ({ event }, enq) => {
      refuseBusy(enq, event);
      return {};
    },
    merge: ({ event }, enq) => {
      refuseBusy(enq, event);
      return {};
    },
    discard: ({ event }, enq) => {
      refuseBusy(enq, event);
      return {};
    },
    create: ({ event }, enq) => {
      refuseBusy(enq, event);
      return {};
    },
    rename: ({ event }, enq) => {
      refuseBusy(enq, event);
      return {};
    },
    /* A continuation with no verb pending, and answers to requests no longer outstanding, are stale (MC-R18). */
    confirm: () => ({}),
    cancel: () => ({}),
    checkoutAdded: () => ({}),
    checkoutRemoved: () => ({}),
    operationFailed: () => ({}),
    revisionMinted: () => ({}),
    nothingToSave: () => ({}),
    cutFailed: () => ({}),
    casLost: () => ({}),
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        switch: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'switch',
            requestId: event.requestId,
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
            requestId: event.requestId,
            branch: event.branch,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        discard: {
          target: 'checking',
          context: ({ event }) => ({
            operation: 'discard',
            requestId: event.requestId,
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
            requestId: event.requestId,
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
            requestId: event.requestId,
            branch: event.branch,
            name: event.name,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
      },
    },
    checking: {
      tags: ['busy'],
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
      tags: ['busy'],
      always: ({ context }) => (context.needsConfirmation ? { target: 'confirming' } : { target: 'applying' }),
    },
    confirming: {
      tags: ['asking'],
      on: {
        confirm: { target: 'applying' },
        cancel: { target: 'idle', context: clearTransient },
      },
    },
    applying: {
      tags: ['busy'],
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
              reportMove(context, enq, {
                type: 'checkoutChanged',
                checkoutId: event.output.checkoutId,
                revisionId: event.output.revisionId,
                treeId: event.output.treeId,
                branch: event.output.branch,
              });
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
                revisionId: event.output.revisionId,
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
        /* The registry's own verbs, asked through the parent and answered by id:
         * the registry answers in every state, so no bound waits on it (RM-R3). */
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
              entry: ({ context }, enq) => {
                delegate(context, enq, 'cut');
              },
              on: {
                revisionMinted: ({ context, event, guards }) =>
                  guards.answersUs(context, event.requestId, 'cut')
                    ? { target: 'adding', context: { from: event.revisionId } }
                    : {},
                nothingToSave: ({ context, event, guards }) => {
                  if (!guards.answersUs(context, event.requestId, 'cut')) {
                    return {};
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
                  guards.answersUs(context, event.requestId, 'cut')
                    ? {
                        target: '#branch.failed',
                        context: {
                          reason: event.reason,
                          /* Whatever refused the cut named this; the page turns it
                             into words rather than falling back (P4). */
                          reasonCode: event.code,
                        },
                      }
                    : {},
                casLost: ({ context, event, guards }) =>
                  guards.answersUs(context, event.requestId, 'cut')
                    ? {
                        target: '#branch.failed',
                        context: failWith('Something else changed this project first. Try again.', 'CAS_LOST'),
                      }
                    : {},
              },
            },
            adding: {
              entry: ({ context }, enq) => {
                delegate(context, enq, 'addCheckout');
              },
              on: {
                /* The registry named the checkout it made; for a `create` that is what `toast.branch` carries out (P4). */
                checkoutAdded: ({ context, event, guards }) =>
                  guards.answersUs(context, event.requestId, 'add')
                    ? {
                        target: '#branch.applied',
                        context: { checkoutId: event.checkoutId, checkoutRoot: event.checkoutRoot },
                      }
                    : {},
                operationFailed: ({ context, event, guards }) =>
                  guards.answersUs(context, event.requestId, 'add')
                    ? { target: '#branch.failed', context: failFromRegistry(event) }
                    : {},
              },
            },
          },
        },
        discarding: {
          entry: ({ context }, enq) => {
            delegate(context, enq, 'removeCheckout');
          },
          on: {
            checkoutRemoved: ({ context, event, guards }) =>
              guards.answersUs(context, event.requestId, 'remove') ? { target: '#branch.applied' } : {},
            operationFailed: ({ context, event, guards }) =>
              guards.answersUs(context, event.requestId, 'remove')
                ? { target: '#branch.failed', context: failFromRegistry(event) }
                : {},
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
            /* RM-R5: a rename that moved a checkout's HEAD says which, so that checkout re-reads its branch. */
            onDone: ({ context, event }, enq) => {
              if (event.output.checkoutId !== undefined) {
                reportMove(context, enq, { type: 'checkoutChanged', checkoutId: event.output.checkoutId });
              }
              return { target: '#branch.applied', context: { branch: event.output.branch } };
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
          requestId: context.requestId ?? '',
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
          requestId: context.requestId ?? '',
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

type BranchMachineDefinition = typeof branchMachineDefinition;

/**
 * The type of {@link branchMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface BranchMachine extends BranchMachineDefinition {}

/**
 * Headless branch verbs for one project.
 *
 * @public
 */
export const branchMachine: BranchMachine = branchMachineDefinition;

/**
 * Selects whether a branch verb is waiting for the user to confirm it.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the machine carries the declared `asking` tag (MC-R28).
 * @public
 */
export const selectBranchNeedsConfirmation = (snapshot: SnapshotFrom<typeof branchMachine>): boolean =>
  snapshot.hasTag('asking');

/**
 * Selects whether a branch verb is running right now.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the machine carries the declared `busy` tag (MC-R28).
 * @public
 */
export const selectBranchBusy = (snapshot: SnapshotFrom<typeof branchMachine>): boolean => snapshot.hasTag('busy');

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
