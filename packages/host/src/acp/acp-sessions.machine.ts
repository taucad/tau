/**
 * `acpSessions` — the ACP sessions of one ACP port (W10 EA-S6).
 *
 * One parent per port, one `acpSession` child per key (`${agentId}:${chatId}`);
 * the child id is the key (EA-R1). The parent owns the slot table, the LRU
 * order, the idle timers, eviction, one queued acquire per closing key, and the
 * one-run-per-chat backstop. It refines `specs/AcpSessions.tla` at `TARGET`:
 * - **Eviction closes only resting children**, least recent first, after every
 *   `opened` and `turnEnded` (EA-R2), so at most `limit` stay open unless more
 *   are lent.
 * - **A closing slot keeps its key** (EA-R3): one acquire waits on it, and a new
 *   child is spawned only after `closed`, the only completion signal (EA-R13).
 * - **The parent owns the idle timer** (EA-R4): the delayed raise `idle:<key>`
 *   is cancelled in the same step as every exit from resting.
 * - **Freshness and cwd are decided at acquire** from `event.at` (EA-R5).
 * - **A second turn for a chat is refused** `CHAT_RUN_LIVE` (EA-R11).
 */

import { setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject } from 'xstate';

import { acpSessionMachine, refines } from '#acp/acp-session.machine.js';
import {
  parentContextSchema as contextSchema,
  parentEmittedSchemas as emittedSchemas,
  parentEventSchemas as eventSchemas,
} from '#acp/acp-machine-schemas.js';
import type { AcpSessionsContext, AcpSessionsEvent } from '#acp/acp-machine-schemas.js';
import type { AcpFailure, AcpLend, AcpOpening, AcpSessionsAction, AcpTurnResult } from '#acp/acp-session.machine.js';

/** One turn asking for its chat's session. */
export type AcpAcquire = {
  /** `${runId}:${attempt}` (D15). */
  readonly requestId: string;
  /** `${agentId}:${chatId}`. */
  readonly key: string;
  readonly chatId: string;
  readonly cwd: string;
  /** Stamped by the facade; no guard reads a clock (I27). */
  readonly at: number;
  /** When the capability minted for this acquire expires; used only if a child is spawned. */
  readonly capabilityExpiresAt?: number | undefined;
  readonly opening: AcpOpening;
  readonly lend: AcpLend;
};

type SlotBase = {
  readonly chatId: string;
  readonly cwd: string;
  readonly capabilityExpiresAt?: number | undefined;
  /* The ref `spawn` returned: it types the payload (RV4 t1–t3). */
  readonly ref: AnyActorRef;
};

/** The parent's record for one key: a map record, not a state. */
export type AcpSlot = SlotBase &
  (
    | { readonly status: 'opening' | 'lent'; readonly requestId: string }
    | { readonly status: 'resting' }
    | { readonly status: 'closing'; readonly queued?: AcpAcquire | undefined }
  );

/**
 * Least recently used resting keys to close, so at most `limit` children stay open unless more are lent.
 *
 * @param slots - The slot table.
 * @param order - Keys, least recent first.
 * @param limit - The open-child limit.
 * @returns The keys to close.
 * @internal
 */
export const evictionVictims = (
  slots: Readonly<Record<string, AcpSlot>>,
  order: readonly string[],
  limit: number,
): readonly string[] => {
  const open = order.filter((key) => slots[key]?.status === 'lent' || slots[key]?.status === 'resting');
  return open.filter((key) => slots[key]?.status === 'resting').slice(0, Math.max(0, open.length - limit));
};

/** Input of {@link acpSessionsMachine}. */
export type AcpSessionsInput = {
  /** Open children kept before resting ones are evicted. */
  readonly limit: number;
  /** E19: milliseconds a resting child may sit idle. */
  readonly idleTimeout: number;
  /** A child whose capability expires within this margin is closed, not lent. */
  readonly renewalMargin: number;
};

/** What the parent tells the facade. */
export type AcpSessionsEmitted =
  | { readonly type: 'turnSettled'; readonly requestId: string; readonly outcome: AcpTurnResult }
  | { readonly type: 'chatClosed'; readonly requestId: string }
  | { readonly type: 'refused'; readonly requestId: string; readonly failure: AcpFailure };

type Slots = Readonly<Record<string, AcpSlot>>;
type Enqueue = EnqueueObject<AcpSessionsEvent, AcpSessionsEmitted>;

/**
 * Events a state takes on purpose without a transition (MC-R17): `ready` takes every event, and `failed` is final.
 *
 * @internal
 */
export const acpSessionsIgnoredEvents = { acpSessions: [] } as const satisfies Readonly<
  Record<string, ReadonlyArray<readonly [state: string, eventType: string]>>
>;

const chatLive = (slots: Slots, chatId: string): boolean =>
  Object.values(slots).some(
    (slot) =>
      slot.chatId === chatId &&
      (slot.status === 'opening' || slot.status === 'lent' || (slot.status === 'closing' && slot.queued !== undefined)),
  );

const recent = (order: readonly string[], key: string): string[] => [...order.filter((entry) => entry !== key), key];

const idleId = (key: string): string => `idle:${key}`;

const base = (slot: AcpSlot): SlotBase => ({
  chatId: slot.chatId,
  cwd: slot.cwd,
  ...(slot.capabilityExpiresAt === undefined ? {} : { capabilityExpiresAt: slot.capabilityExpiresAt }),
  ref: slot.ref,
});

/* Close a child: its slot keeps the key while it closes (EA-R3). */
const closeSlot = (
  slots: Slots,
  enq: Enqueue,
  { key, queued }: { readonly key: string; readonly queued?: AcpAcquire },
): Record<string, AcpSlot> => {
  const slot = slots[key];
  if (slot === undefined) {
    return { ...slots };
  }
  enq.cancel(idleId(key));
  enq.sendTo(slot.ref, { type: 'close' });
  return { ...slots, [key]: { ...base(slot), status: 'closing', ...(queued === undefined ? {} : { queued }) } };
};

/* EA-R2: close the least recent resting children beyond the limit. */
const evict = (
  context: AcpSessionsContext,
  enq: Enqueue,
  { slots, order }: { readonly slots: Slots; readonly order: readonly string[] },
): Record<string, AcpSlot> => {
  let next: Record<string, AcpSlot> = { ...slots };
  for (const key of evictionVictims(slots, order, context.limit)) {
    next = closeSlot(next, enq, { key });
  }
  return next;
};

type SpawnArgs = Readonly<{
  self: AnyActorRef;
  actors: { readonly acpSession: typeof acpSessionMachine };
}>;

/* A child for this acquire, by logic value with id = key (W2 form f). */
const spawnFor = (args: SpawnArgs, enq: Enqueue, acquire: AcpAcquire): AcpSlot => {
  const ref = enq.spawn(args.actors.acpSession, {
    id: acquire.key,
    input: { key: acquire.key, parentRef: args.self, opening: acquire.opening, lend: acquire.lend },
  });
  return {
    chatId: acquire.chatId,
    cwd: acquire.cwd,
    ...(acquire.capabilityExpiresAt === undefined ? {} : { capabilityExpiresAt: acquire.capabilityExpiresAt }),
    ref,
    status: 'opening',
    requestId: acquire.requestId,
  };
};

const settled = (enq: Enqueue, requestId: string, outcome: AcpTurnResult): void => {
  enq.emit({ type: 'turnSettled', requestId, outcome });
};

const cancelled: AcpFailure = { code: 'EXTERNAL_AGENT_CANCELLED', message: 'The external agent turn was cancelled.' };
const failed: AcpFailure = { code: 'EXTERNAL_AGENT_FAILED', message: 'The external agent session ended unexpectedly.' };
const chatRunLive = (chatId: string): AcpFailure => ({
  code: 'CHAT_RUN_LIVE',
  message: `Chat ${chatId} already has an external agent turn in its session.`,
});

/* Answer every `closeChat` whose chat has no slots left. */
const answerCloses = (
  closeRequests: Readonly<Record<string, string>>,
  slots: Slots,
  enq: Enqueue,
): Record<string, string> => {
  const pending: Record<string, string> = {};
  for (const [requestId, chatId] of Object.entries(closeRequests)) {
    if (Object.values(slots).some((slot) => slot.chatId === chatId)) {
      pending[requestId] = chatId;
    } else {
      enq.emit({ type: 'chatClosed', requestId });
    }
  }
  return pending;
};

const machineDefinition = setup({
  schemas: {
    context: contextSchema,
    input: types<AcpSessionsInput>(),
    events: eventSchemas,
    emitted: emittedSchemas,
    transitionMeta: types<{ tla: AcpSessionsAction }>(),
  },
  actors: { acpSession: acpSessionMachine },
});

/**
 * The ACP sessions of one port: slots, LRU eviction, idle close and the one-run-per-chat backstop (W10 EA-S6).
 *
 * @internal
 */
export const acpSessionsMachine = machineDefinition.createMachine({
  id: 'acpSessions',
  version: '1',
  context: ({ input }) => ({
    limit: input.limit,
    idleTimeout: input.idleTimeout,
    renewalMargin: input.renewalMargin,
    order: [],
    slots: {},
    closeRequests: {},
  }),
  /*
   * A real fault only: checked sends cannot raise a communication error. Every
   * waiting turn and `closeChat` is answered; the facade starts a fresh parent
   * (MC-R24), and stopping this one stops every child, whose connection kills
   * its process group.
   */
  onError: refines('Unmodelled', ({ context }, enq) => {
    for (const slot of Object.values(context.slots)) {
      if (slot.status === 'opening' || slot.status === 'lent') {
        settled(enq, slot.requestId, { ok: false, failure: failed });
      } else if (slot.status === 'closing' && slot.queued !== undefined) {
        settled(enq, slot.queued.requestId, { ok: false, failure: failed });
      }
    }
    for (const requestId of Object.keys(context.closeRequests)) {
      enq.emit({ type: 'chatClosed', requestId });
    }
    return { target: '.failed', context: { slots: {}, closeRequests: {} } };
  }),
  initial: 'ready',
  states: {
    ready: {
      on: {
        acquire: refines('Acquire', ({ context, event, self, actors }, enq) => {
          const { acquire } = event;
          const { key } = acquire;
          if (chatLive(context.slots, acquire.chatId)) {
            enq.emit({ type: 'refused', requestId: acquire.requestId, failure: chatRunLive(acquire.chatId) });
            return {};
          }
          const slot = context.slots[key];
          if (slot === undefined) {
            return {
              context: { slots: { ...context.slots, [key]: spawnFor({ self, actors }, enq, acquire) } },
            };
          }
          if (slot.status === 'closing') {
            return { context: { slots: { ...context.slots, [key]: { ...slot, queued: acquire } } } };
          }
          /* Resting (a lent or opening slot is the chat's live run, refused above). */
          const fresh =
            slot.capabilityExpiresAt === undefined || slot.capabilityExpiresAt - acquire.at >= context.renewalMargin;
          if (fresh && slot.cwd === acquire.cwd) {
            enq.cancel(idleId(key));
            enq.sendTo(slot.ref, { type: 'lend', lend: acquire.lend });
            return {
              context: {
                order: recent(context.order, key),
                slots: { ...context.slots, [key]: { ...base(slot), status: 'lent', requestId: acquire.requestId } },
              },
            };
          }
          /* EA-R5: a stale capability or another tree closes the child; this acquire waits for `closed`. */
          return { context: { slots: closeSlot(context.slots, enq, { key, queued: acquire }) } };
        }),
        cancel: refines('Cancel', ({ context, event }, enq) => {
          for (const [key, slot] of Object.entries(context.slots)) {
            if ((slot.status === 'opening' || slot.status === 'lent') && slot.requestId === event.requestId) {
              enq.sendTo(slot.ref, { type: 'cancel' });
              return {};
            }
            if (slot.status === 'closing' && slot.queued?.requestId === event.requestId) {
              settled(enq, event.requestId, { ok: false, failure: cancelled });
              return { context: { slots: { ...context.slots, [key]: { ...base(slot), status: 'closing' } } } };
            }
          }
          /* The request already settled (MC-R18). */
          return {};
        }),
        closeChat: refines('CloseChat', ({ context, event }, enq) => {
          if (chatLive(context.slots, event.chatId)) {
            enq.emit({ type: 'refused', requestId: event.requestId, failure: chatRunLive(event.chatId) });
            return {};
          }
          let slots: Record<string, AcpSlot> = { ...context.slots };
          for (const [key, slot] of Object.entries(context.slots)) {
            if (slot.chatId === event.chatId && slot.status === 'resting') {
              slots = closeSlot(slots, enq, { key });
            }
          }
          return {
            context: {
              slots,
              closeRequests: answerCloses({ ...context.closeRequests, [event.requestId]: event.chatId }, slots, enq),
            },
          };
        }),
        idleExpired: refines('IdleExpired', ({ context, event }, enq) =>
          /* Stale otherwise: every exit from resting cancels `idle:<key>` in the same step (MC-R16). */
          context.slots[event.key]?.status === 'resting'
            ? { context: { slots: closeSlot(context.slots, enq, { key: event.key }) } }
            : {},
        ),
        opened: refines('Opened', ({ context, event }, enq) => {
          const slot = context.slots[event.key];
          if (slot?.status !== 'opening') {
            return {};
          }
          const order = recent(context.order, event.key);
          const lent: AcpSlot = { ...slot, status: 'lent' };
          return {
            context: { order, slots: evict(context, enq, { slots: { ...context.slots, [event.key]: lent }, order }) },
          };
        }),
        turnEnded: refines('TurnEnded', ({ context, event }, enq) => {
          const slot = context.slots[event.key];
          if ((slot?.status !== 'opening' && slot?.status !== 'lent') || slot.requestId !== event.requestId) {
            /* A stale report (MC-R18). */
            return {};
          }
          settled(enq, event.requestId, event.outcome);
          const order = recent(context.order, event.key);
          const ended: AcpSlot = { ...base(slot), status: event.resting ? 'resting' : 'closing' };
          const slots = evict(context, enq, { slots: { ...context.slots, [event.key]: ended }, order });
          if (slots[event.key]?.status === 'resting') {
            /* E19: the delayed raise idle:<key>, after idleTimeout. */
            enq.raise({ type: 'idleExpired', key: event.key }, { id: idleId(event.key), delay: context.idleTimeout });
          }
          return { context: { order, slots } };
        }),
        closed: refines('AdapterExited', ({ context, event, self, actors }, enq) => {
          const slot = context.slots[event.key];
          if (slot === undefined) {
            return {};
          }
          if (slot.status === 'opening' || slot.status === 'lent') {
            /* Defensive: the child always ends its turn first. */
            settled(enq, slot.requestId, { ok: false, failure: event.failure ?? failed });
          }
          enq.cancel(idleId(event.key));
          enq.stop(slot.ref);
          const order = context.order.filter((key) => key !== event.key);
          const queued = slot.status === 'closing' ? slot.queued : undefined;
          const { [event.key]: _closed, ...rest } = context.slots;
          /* W2 forms e and f: stop the old child, then spawn a fresh one with the same id. */
          const slots = queued === undefined ? rest : { ...rest, [event.key]: spawnFor({ self, actors }, enq, queued) };
          return { context: { order, slots, closeRequests: answerCloses(context.closeRequests, slots, enq) } };
        }),
      },
    },
    failed: { type: 'final' },
  },
});
