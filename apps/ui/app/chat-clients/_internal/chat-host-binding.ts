import { fromCallback } from 'xstate';
import type { EventObject } from 'xstate';
import { Topic } from '@taucad/events';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { registerAgentHost } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { BrowserAgentHostRegistration } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { ChatTurn, ChatTurnGesture, ChatTurnSettlementInput } from '#machines/chat-session.machine.js';

/**
 * What one chat's host binding is composed from, published by its route.
 *
 * The registration itself has to be built where the project's resources are —
 * the workspace authority, the file manager's bridge, the model catalog — but
 * *owning* it there is what broke the capability: `useCadChatClient` is mounted
 * once per transcript message plus four other places, every instance registered
 * the chat's host in one module-level map, and the last instance to unmount
 * deleted the entry. A rewinding dispatch truncates the transcript, so the
 * newest message components unmounted with nothing left to re-register and the
 * turn died on "Browser agent host is not configured" after a ten-second wait.
 *
 * So the route publishes the *ingredients* through this seam and the chat's own
 * session actor is the one registrant (V6). `compose` is called by the binding
 * actor, not by React, and reads whatever the route last published — the agent
 * config a turn admits with is the live one, never the render that registered.
 */
export type ChatHostServices = Readonly<{
  /** The placement these services build for; the binding re-registers when it changes. */
  placement: string;
  /** Builds this chat's registration for {@link ChatHostServices.placement}. */
  compose: () => BrowserAgentHostRegistration | undefined;
}>;

const servicesByChat = new Map<string, ChatHostServices>();
const servicesTopic = new Topic<{ readonly chatId: string }>({ name: 'chat.host-services' });

/**
 * Publish the ingredients one chat's host binding is composed from.
 *
 * @param chatId - The chat these services belong to.
 * @param services - The placement and the composer the binding calls.
 * @returns The unpublication, for the publisher's effect cleanup.
 * @public
 */
export const publishChatHostServices = (chatId: string, services: ChatHostServices): (() => void) => {
  servicesByChat.set(chatId, services);
  servicesTopic.emit({ chatId });
  return () => {
    if (servicesByChat.get(chatId) === services) {
      servicesByChat.delete(chatId);
      servicesTopic.emit({ chatId });
    }
  };
};

/** The services last published for one chat. @public */
export const chatHostServices = (chatId: string): ChatHostServices | undefined => servicesByChat.get(chatId);

/** Test-only reset of the module registry. @internal */
export const resetChatHostServices = (): void => {
  servicesByChat.clear();
};

/**
 * One chat's host registration, held for as long as its session actor runs.
 *
 * Invoked by `chatSessionMachine`'s `host` region, which re-enters — and so
 * re-invokes this exactly once — when the turn's placement changes. Nothing
 * else may call `registerAgentHost` for a chat: one actor per chat is what
 * makes "a chat that can dispatch is configured" structural rather than a race
 * between five mount sites.
 *
 * @public
 */
export const chatHostBinding = fromCallback<EventObject, { readonly chatId: string; readonly placement: string }>(
  ({ input }) => {
    let unregister: (() => void) | undefined;
    const bind = (): void => {
      const services = chatHostServices(input.chatId);
      if (services === undefined || services.placement !== input.placement) {
        /* The route has not published for this placement yet — or has published
         * for a newer one, whose own re-invocation is already on its way. */
        return;
      }
      const registration = services.compose();
      if (registration === undefined) {
        return;
      }
      unregister?.();
      unregister = registerAgentHost(input.chatId, registration);
    };
    bind();
    const unsubscribe = servicesTopic.subscribe({
      handler: () => {
        bind();
      },
      interestedIn: (event) => event.chatId === input.chatId,
    });
    return () => {
      unsubscribe();
      unregister?.();
    };
  },
);

/**
 * Take one chat's next turn: derive its rewind point, wait out host
 * availability, resolve the model, pre-flight credits, lease the checkout and
 * compose the request that runs it.
 *
 * Published by the chat's `ChatTurnHost` — the one mount that has the project's
 * resources — and called by `chatSessionMachine`'s `queued` state, never by
 * React. @public
 */
export type ChatTurnAdmit = (gesture: ChatTurnGesture) => Promise<ChatTurn>;

/**
 * End one chat's turn: hand it to the revision root and release the hold.
 *
 * Published per chat by `SingleChatRunSettlement`, which renders for every chat
 * of the project rather than only the focused one — a turn outlives the view
 * that started it. @public
 */
export type ChatTurnSettle = (input: ChatTurnSettlementInput) => Promise<void>;

const admissionsByChat = new Map<string, ChatTurnAdmit>();
const settlementsByChat = new Map<string, ChatTurnSettle>();
const turnServicesTopic = new Topic<{ readonly chatId: string }>({ name: 'chat.turn-services' });

const publishTurnService = <T>(registry: Map<string, T>, chatId: string, service: T): (() => void) => {
  registry.set(chatId, service);
  turnServicesTopic.emit({ chatId });
  return () => {
    if (registry.get(chatId) === service) {
      registry.delete(chatId);
    }
  };
};

/**
 * Publish how this chat admits a turn.
 *
 * @param chatId - The chat these services belong to.
 * @param admit - The admission the chat's session actor invokes.
 * @returns The unpublication, for the publisher's effect cleanup.
 * @public
 */
export const publishChatTurnAdmission = (chatId: string, admit: ChatTurnAdmit): (() => void) =>
  publishTurnService(admissionsByChat, chatId, admit);

/**
 * Publish how this chat settles a turn.
 *
 * @param chatId - The chat these services belong to.
 * @param settle - The settlement the chat's session actor invokes.
 * @returns The unpublication, for the publisher's effect cleanup.
 * @public
 */
export const publishChatTurnSettlement = (chatId: string, settle: ChatTurnSettle): (() => void) =>
  publishTurnService(settlementsByChat, chatId, settle);

/** The admission last published for one chat. @public */
export const chatTurnAdmit = (chatId: string): ChatTurnAdmit | undefined => admissionsByChat.get(chatId);

/** The settlement last published for one chat. @public */
export const chatTurnSettle = (chatId: string): ChatTurnSettle | undefined => settlementsByChat.get(chatId);

/**
 * Forget one chat's turn services, when its session is disposed.
 *
 * Not on the publisher's unmount: a turn outlives the view that started it, and
 * a chat whose route unmounted mid-admission still has to reach a host. The
 * store owns when the chat itself is gone.
 *
 * @param chatId - The chat whose session was disposed.
 * @public
 */
export const clearChatTurnServices = (chatId: string): void => {
  admissionsByChat.delete(chatId);
  settlementsByChat.delete(chatId);
};

/** Test-only reset of the turn-service registries. @internal */
export const resetChatTurnServices = (): void => {
  admissionsByChat.clear();
  settlementsByChat.clear();
};

/**
 * Upper bound on waiting for a chat's route to publish a turn service.
 * Milliseconds.
 */
const turnServiceWaitTimeout = 30_000;

/**
 * Wait until this chat has published the named service.
 *
 * The chat's seeded first turn is requested from inside the store's own chat
 * loader, one render before the route that publishes these services has
 * mounted. Whoever knows when the condition clears does the waiting (the
 * publisher's topic), so nothing polls.
 *
 * Bounded as well as aborted (I6). Only the *focused* chat mounts the
 * `ChatTurnHost` that publishes an admission, while the sidebar seeds a turn
 * for any acquired chat with an eligible startup request — so for a chat that
 * never gets focus this condition can never clear, and the unbounded wait left
 * the turn in `queued.admitting` forever, pinning the session with `runHeld`
 * and putting nothing on the row to click (T3-D4). An unbounded wait is only
 * sound when the condition is guaranteed to clear; this one is not, so it
 * expires and the turn fails visibly instead.
 */
const awaitTurnService = async <T>(
  registry: Map<string, T>,
  chatId: string,
  signal?: AbortSignal,
): Promise<T | undefined> => {
  const present = registry.get(chatId);
  if (present !== undefined || signal?.aborted === true) {
    return present;
  }
  return new Promise<T | undefined>((resolve) => {
    const finish = (value: T | undefined): void => {
      globalThis.clearTimeout(serviceExpiry);
      signal?.removeEventListener('abort', onAbort);
      unsubscribe();
      resolve(value);
    };
    const onAbort = (): void => {
      finish(undefined);
    };
    const unsubscribe = turnServicesTopic.subscribe({
      handler: () => {
        const service = registry.get(chatId);
        if (service !== undefined) {
          finish(service);
        }
      },
      interestedIn: (event) => event.chatId === chatId,
    });
    const serviceExpiry = globalThis.setTimeout(onAbort, turnServiceWaitTimeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    const late = registry.get(chatId);
    if (late !== undefined) {
      finish(late);
    }
  });
};

/**
 * The chat's admission, as `chatSessionMachine.run.queued` invokes it.
 *
 * On abort — a second gesture replaced this one — the lease this admission
 * took is released before the actor goes, and no other: the run id it settles
 * is the one it just minted (V4).
 *
 * @public
 */
export const chatTurnAdmission = fromSafeAsync<
  { readonly type: 'turnAdmitted'; readonly turn: ChatTurn },
  { readonly chatId: string; readonly gesture: ChatTurnGesture }
>(async ({ input, signal }) => {
  const admit = await awaitTurnService(admissionsByChat, input.chatId, signal);
  if (admit === undefined) {
    throw new Error('This chat is not ready to run a turn yet.');
  }
  const turn = await admit(input.gesture);
  if (signal.aborted) {
    /* Under a bound of its own, not this actor's signal: that signal is already
     * aborted, and the abort is often a dispose, which deletes this chat's turn
     * services in the same breath. Reading the registry directly meant the
     * release was an optional call on `undefined` — a silent no-op that left
     * the checkout leased and `admitted` forever, so every later turn of the
     * chat waited fifteen seconds and died on a stale claim (T3-D2). */
    const settle = await awaitTurnService(settlementsByChat, input.chatId);
    await settle?.({
      chatId: input.chatId,
      runId: turn.runId,
      leaseTurnId: turn.leaseTurnId,
      outcome: 'cancelled',
    }).catch((error: unknown) => {
      console.error('[chatTurnAdmission] an abandoned lease was not released', error);
    });
    throw new Error('This turn was replaced before it started.');
  }
  return { type: 'turnAdmitted', turn };
});

/**
 * The chat's settlement, as `chatSessionMachine.run.finishing` invokes it.
 *
 * A chat with no publisher settles nothing and resolves: the run it held was
 * never placed on this browser's checkout (a daemon owns its own), so there is
 * no hold to release here. @public
 */
export const chatTurnSettlement = fromSafeAsync<void, ChatTurnSettlementInput>(async ({ input, signal }) => {
  const settle = await awaitTurnService(settlementsByChat, input.chatId, signal);
  await settle?.(input);
});
