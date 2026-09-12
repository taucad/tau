/**
 * `project-revisions.machine` — the root of one project's revision actor tree.
 *
 * A host creates exactly this actor. The always-on children of this wave
 * (`checkouts`, `restore`) are **invoked**, so they stop with the root; the
 * variable-count children (`checkout` per registered checkout, `turn` per
 * admitted turn) are **spawned** with stored refs and stopped with `stopChild`
 * on removal and on root `exit`. Later waves add `sync`, `remote`, `branch` and
 * `publish` as further invoked children.
 *
 * No `systemId` is used anywhere: the app is one XState system and a second live
 * project would collide (F1). Children get `parentRef` through `input` and
 * address siblings by sending to this root, which routes. This root also owns
 * the workbench selection and D10's switch guard (F10), because the choice needs
 * `checkouts`' lease set.
 */

import { assign, emit, enqueueActions, sendTo, setup } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutCutTrigger, CheckoutStatus } from '#checkout.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import type { CheckoutRecord } from '#checkouts.machine.js';
import { restoreMachine } from '#restore.machine.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnSettlement } from '#turn.machine.js';

/** What one checkout last reported about itself. @public */
export type CheckoutStatusEntry = Readonly<{ status: CheckoutStatus; headRevisionId: string | undefined }>;

/**
 * The coalesced status one project publishes to its UI.
 *
 * `Rev N` and the sync facet are not here: `Rev N` is derived from the graph at
 * read time (I3) and sync arrives with `sync.machine` in W5. W3d joins this
 * projection with those.
 *
 * @public
 */
export type RevisionStatusProjection = Readonly<{
  projectId: string;
  checkoutId: string | undefined;
  branch: string | undefined;
  dirty: boolean;
  minting: boolean;
  headRevisionId: string | undefined;
  follow: 'chat' | 'pinned';
  /** Checkouts that need a person: a failed cut or a head that lost its CAS. */
  attention: number;
}>;

/** Input accepted when creating the projectRevisionsMachine actor. @public */
export type ProjectRevisionsMachineInput = Readonly<{
  projectId: string;
  /** The checkout that is the project directory itself. */
  liveCheckoutId?: string;
  selectedCheckoutId?: string;
}>;

/** Serializable state owned by projectRevisionsMachine. @public */
export type ProjectRevisionsMachineContext = Readonly<{
  projectId: string;
  checkouts: readonly CheckoutRecord[];
  checkoutStatus: Readonly<Record<string, CheckoutStatusEntry>>;
  liveCheckoutId: string | undefined;
  selectedCheckoutId: string | undefined;
  follow: 'chat' | 'pinned';
  followedChatId: string | undefined;
  checkoutRefs: Readonly<Record<string, ActorRefFrom<typeof checkoutMachine>>>;
  turnRefs: Readonly<Record<string, ActorRefFrom<typeof turnMachine>>>;
  /** Which checkout each chat's last prepared turn landed on, for `followChat`. */
  chatCheckouts: Readonly<Record<string, string>>;
}>;

/** Events accepted by projectRevisionsMachine. @public */
export type ProjectRevisionsMachineEvent =
  | Readonly<{ type: 'checkoutsChanged'; checkouts: readonly CheckoutRecord[] }>
  | Readonly<{
      type: 'checkoutStatusChanged';
      checkoutId: string;
      status: CheckoutStatus;
      headRevisionId?: string;
    }>
  | Readonly<{ type: 'admitTurn'; turnId: string; chatId: string; runId: string; checkoutId?: string }>
  | Readonly<{
      type: 'turnPrepared';
      turnId: string;
      chatId: string;
      checkoutId: string;
      branch: string | undefined;
    }>
  | Readonly<{
      type: 'cut';
      trigger: CheckoutCutTrigger;
      turnId: string;
      checkoutId: string | undefined;
      leaseIds: readonly string[];
    }>
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
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      reason: string;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  | Readonly<{ type: 'leaseStale'; runId: string }>
  | Readonly<{
      type: 'checkoutChanged';
      checkoutId: string;
      revisionId: string;
      treeId: string;
      branch: string | undefined;
    }>
  | Readonly<{ type: 'switch'; branch: string }>
  | Readonly<{ type: 'followChat'; chatId: string }>
  | Readonly<{ type: 'pinTo'; checkoutId: string }>;

/** Facts projectRevisionsMachine emits for a host that holds only the root. @public */
export type ProjectRevisionsMachineEmitted =
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      revisionId: string;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  | Readonly<{
      type: 'switchResolved';
      branch: string;
      /** `reroot` moves the workbench; `applyToLive` asks for head(branch) on live. */
      mode: 'reroot' | 'applyToLive';
      checkoutId: string;
    }>
  | Readonly<{ type: 'switchRefused'; branch: string; reason: string }>;

const selectedRecord = (context: ProjectRevisionsMachineContext): CheckoutRecord | undefined =>
  context.checkouts.find((checkout) => checkout.id === context.selectedCheckoutId);

/**
 * Headless root of one project's revision actor tree.
 *
 * @public
 */
export const projectRevisionsMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as ProjectRevisionsMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as ProjectRevisionsMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as ProjectRevisionsMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as ProjectRevisionsMachineInput,
  },
  actors: {
    checkouts: checkoutsMachine,
    restore: restoreMachine,
    checkout: checkoutMachine,
    turn: turnMachine,
  },
  guards: {
    turnIsNew: ({ context }, params: Readonly<{ turnId: string }>) => context.turnRefs[params.turnId] === undefined,
  },
  actions: {
    /* Tell `restore` which checkout the workbench is rooted at now. */
    announceSelection: sendTo('restore', ({ context }) => ({
      type: 'selectCheckout',
      checkoutId: context.selectedCheckoutId ?? '',
      headRevisionId: selectedRecord(context)?.headRevisionId,
    })),
  },
}).createMachine({
  id: 'project-revisions',
  context: ({ input }) => ({
    projectId: input.projectId,
    checkouts: [],
    checkoutStatus: {},
    liveCheckoutId: input.liveCheckoutId,
    selectedCheckoutId: input.selectedCheckoutId ?? input.liveCheckoutId,
    follow: 'chat',
    followedChatId: undefined,
    checkoutRefs: {},
    turnRefs: {},
    chatCheckouts: {},
  }),
  invoke: [
    {
      id: 'checkouts',
      src: 'checkouts',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
    },
    {
      id: 'restore',
      src: 'restore',
      input: ({ context, self }) => ({
        projectId: context.projectId,
        checkoutId: context.selectedCheckoutId ?? '',
        parentRef: self,
      }),
    },
    /* W4 adds `branch`, W5 adds `sync`, `remote` and `publish` here. */
  ],
  entry: sendTo('checkouts', { type: 'open' }),
  exit: enqueueActions(({ context, enqueue }) => {
    for (const ref of Object.values(context.checkoutRefs)) {
      enqueue.stopChild(ref);
    }
    for (const ref of Object.values(context.turnRefs)) {
      enqueue.stopChild(ref);
    }
    enqueue.assign({ checkoutRefs: {}, turnRefs: {} });
  }),
  initial: 'ready',
  states: {
    ready: {
      on: {
        checkoutsChanged: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const known = new Set(event.checkouts.map((checkout) => checkout.id));
            for (const [id, ref] of Object.entries(context.checkoutRefs)) {
              if (!known.has(id)) {
                enqueue.stopChild(ref);
              }
            }
            enqueue.assign(({ context: current, self, spawn }) => {
              const kept = Object.fromEntries(Object.entries(current.checkoutRefs).filter(([id]) => known.has(id)));
              for (const record of event.checkouts) {
                if (kept[record.id] !== undefined) {
                  continue;
                }
                kept[record.id] = spawn('checkout', {
                  id: `checkout:${record.id}`,
                  input: {
                    checkoutId: record.id,
                    branch: record.branch,
                    headRevisionId: record.headRevisionId,
                    parentRef: self,
                  },
                });
              }
              const selected =
                current.selectedCheckoutId !== undefined && known.has(current.selectedCheckoutId)
                  ? current.selectedCheckoutId
                  : current.liveCheckoutId;
              return { checkouts: event.checkouts, checkoutRefs: kept, selectedCheckoutId: selected };
            });
          }),
        },
        checkoutStatusChanged: {
          actions: assign({
            checkoutStatus: ({ context, event }) => ({
              ...context.checkoutStatus,
              [event.checkoutId]: { status: event.status, headRevisionId: event.headRevisionId },
            }),
          }),
        },
        admitTurn: {
          guard: { type: 'turnIsNew', params: ({ event }) => ({ turnId: event.turnId }) },
          actions: assign({
            turnRefs: ({ context, event, self, spawn }) => ({
              ...context.turnRefs,
              [event.turnId]: spawn('turn', {
                id: `turn:${event.turnId}`,
                input: {
                  turnId: event.turnId,
                  chatId: event.chatId,
                  runId: event.runId,
                  ...(event.checkoutId === undefined ? {} : { checkoutId: event.checkoutId }),
                  parentRef: self,
                },
              }),
            }),
          }),
        },
        turnPrepared: {
          actions: assign({
            chatCheckouts: ({ context, event }) => ({ ...context.chatCheckouts, [event.chatId]: event.checkoutId }),
          }),
        },
        cut: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = event.checkoutId === undefined ? undefined : context.checkoutRefs[event.checkoutId];
            if (ref === undefined) {
              return;
            }
            enqueue.sendTo(ref, {
              type: 'cut',
              trigger: event.trigger,
              turnId: event.turnId,
              leaseIds: event.leaseIds,
            });
          }),
        },
        revisionMinted: {
          actions: [
            enqueueActions(({ context, enqueue, event }) => {
              const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, event);
              }
            }),
            emit(({ event }) => event),
          ],
        },
        nothingToSave: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, event);
            }
          }),
        },
        cutFailed: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, event);
            }
          }),
        },
        casLost: { actions: emit(({ event }) => event) },
        turnFinalized: {
          actions: [
            sendTo('checkouts', ({ event }) => event),
            emit(({ event }) => event),
            enqueueActions(({ context, enqueue, event }) => {
              const ref = context.turnRefs[event.turnId];
              if (ref === undefined) {
                return;
              }
              enqueue.stopChild(ref);
              enqueue.assign({
                turnRefs: Object.fromEntries(
                  Object.entries(context.turnRefs).filter(([turnId]) => turnId !== event.turnId),
                ),
              });
            }),
          ],
        },
        turnConflicted: {
          actions: [
            sendTo('checkouts', ({ event }) => event),
            emit(({ event }) => event),
            enqueueActions(({ context, enqueue, event }) => {
              const ref = context.turnRefs[event.turnId];
              if (ref === undefined) {
                return;
              }
              enqueue.stopChild(ref);
              enqueue.assign({
                turnRefs: Object.fromEntries(
                  Object.entries(context.turnRefs).filter(([turnId]) => turnId !== event.turnId),
                ),
              });
            }),
          ],
        },
        leaseStale: { actions: sendTo('checkouts', ({ event }) => event) },
        checkoutChanged: {
          actions: [
            assign({
              checkouts: ({ context, event }) =>
                context.checkouts.map((checkout) =>
                  checkout.id === event.checkoutId
                    ? { ...checkout, headRevisionId: event.revisionId, branch: event.branch }
                    : checkout,
                ),
            }),
            enqueueActions(({ context, enqueue, event }) => {
              const ref = context.checkoutRefs[event.checkoutId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, {
                  type: 'headChanged',
                  revisionId: event.revisionId,
                  treeId: event.treeId,
                });
              }
            }),
          ],
        },
        pinTo: {
          actions: [
            assign({
              selectedCheckoutId: ({ event }) => event.checkoutId,
              follow: 'pinned',
              followedChatId: undefined,
            }),
            'announceSelection',
          ],
        },
        followChat: {
          actions: [
            assign({
              follow: 'chat',
              followedChatId: ({ event }) => event.chatId,
              selectedCheckoutId: ({ context, event }) => context.chatCheckouts[event.chatId] ?? context.liveCheckoutId,
            }),
            'announceSelection',
          ],
        },
        /* D10: one verb. Re-root when the branch has a checkout; otherwise apply
         * to the live checkout, but only while no lease holds it. */
        switch: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const linked = context.checkouts.find((checkout) => checkout.branch === event.branch);
            if (linked !== undefined) {
              enqueue.assign({
                selectedCheckoutId: linked.id,
                follow: 'pinned',
                followedChatId: undefined,
              });
              enqueue.emit({
                type: 'switchResolved',
                branch: event.branch,
                mode: 'reroot',
                checkoutId: linked.id,
              });
              enqueue('announceSelection');
              return;
            }
            const liveRecord = context.checkouts.find((checkout) => checkout.id === context.liveCheckoutId);
            if (liveRecord === undefined || liveRecord.leaseRunIds.length > 0) {
              enqueue.emit({
                type: 'switchRefused',
                branch: event.branch,
                reason:
                  liveRecord === undefined
                    ? 'This project has no live checkout.'
                    : 'An agent is working in the live checkout.',
              });
              return;
            }
            enqueue.assign({
              selectedCheckoutId: liveRecord.id,
              follow: 'pinned',
              followedChatId: undefined,
            });
            enqueue.emit({
              type: 'switchResolved',
              branch: event.branch,
              mode: 'applyToLive',
              checkoutId: liveRecord.id,
            });
            enqueue('announceSelection');
          }),
        },
      },
    },
  },
});

/**
 * Selects the coalesced status W3d publishes for this project.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The projection the UI reads through one stable selector.
 * @public
 */
export const selectRevisionStatus = (
  snapshot: SnapshotFrom<typeof projectRevisionsMachine>,
): RevisionStatusProjection => {
  const { context } = snapshot;
  const selected = context.checkouts.find((checkout) => checkout.id === context.selectedCheckoutId);
  const status =
    context.selectedCheckoutId === undefined ? undefined : context.checkoutStatus[context.selectedCheckoutId];
  return {
    projectId: context.projectId,
    checkoutId: context.selectedCheckoutId,
    branch: selected?.branch,
    dirty: status !== undefined && status.status !== 'clean',
    minting: status?.status === 'minting',
    headRevisionId: status?.headRevisionId ?? selected?.headRevisionId,
    follow: context.follow,
    attention: Object.values(context.checkoutStatus).filter(
      (entry) => entry.status === 'failed' || entry.status === 'stale',
    ).length,
  };
};

/**
 * Selects the checkout the workbench reads (A1).
 *
 * @param snapshot - Current machine snapshot.
 * @returns The selected checkout id, or `undefined` before the registry opens.
 * @public
 */
export const selectSelectedCheckoutId = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): string | undefined =>
  snapshot.context.selectedCheckoutId;
