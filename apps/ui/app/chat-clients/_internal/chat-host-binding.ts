import { Topic } from '@taucad/events';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';

/**
 * Take one chat's next turn: derive its rewind point, wait out host
 * availability, resolve the model, pre-flight credits and compose the request
 * that runs it. The host places the attempt (W8 TS-S5).
 *
 * Published by the chat's `ChatTurnHost` — the one mount that has the project's
 * resources — and called by `chatSessionMachine`'s `queued` state, never by
 * React. @public
 */
export type ChatTurnAdmit = (gesture: ChatTurnGesture) => Promise<ChatTurn>;

const admissionsByChat = new Map<string, ChatTurnAdmit>();
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

/** The admission last published for one chat. @public */
export const chatTurnAdmit = (chatId: string): ChatTurnAdmit | undefined => admissionsByChat.get(chatId);

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
};

/** Test-only reset of the turn-service registries. @internal */
export const resetChatTurnServices = (): void => {
  admissionsByChat.clear();
  releaseChatTurnHold('admission');
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

/** The admission point an e2e row can park a chat's turn at. @public */
export type ChatTurnHold = 'admission';

const holds = new Map<ChatTurnHold, PromiseWithResolvers<void>>();

/**
 * Park this chat's next admission until it is released.
 *
 * `TAU_DEBUG` only, and armed only through the debug probes, because the two
 * `run.queued.admitting` is too brief to hold open from the outside. This
 * lets a browser row make a gesture, reload or stop inside that admission.
 *
 * Global rather than per chat: a row drives one chat.
 *
 * The gate is the caller, not a flag read here: `DebugProbes` is the only
 * thing in the app that arms a hold, and `ChatInterfaceSessionGate` mounts it
 * only under `ENV.TAU_DEBUG`. Nothing arms one in a production bundle, so the
 * wait below is a map lookup that finds nothing.
 *
 * @param hold - Which point to park at.
 * @public
 */
export const armChatTurnHold = (hold: ChatTurnHold): void => {
  if (holds.has(hold)) {
    return;
  }
  holds.set(hold, Promise.withResolvers<void>());
};

/**
 * Let a parked admission carry on.
 *
 * @param hold - The point to release; releasing one that was never armed is a
 *   no-op, so a row's cleanup never has to ask.
 * @public
 */
export const releaseChatTurnHold = (hold: ChatTurnHold): void => {
  holds.get(hold)?.resolve();
  holds.delete(hold);
};

/** Wait out the debug admission hold; nothing armed is one map lookup. */
const awaitChatTurnHold = async (hold: ChatTurnHold): Promise<void> => {
  await holds.get(hold)?.promise;
};

/**
 * The chat's admission, as `chatSessionMachine.run.queued` invokes it.
 *
 * It takes no lease: the host places the attempt when it runs it (W8 TS-S5),
 * so a gesture that replaces this one before it starts leaves nothing to
 * release (V4).
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
  await awaitChatTurnHold('admission');
  const turn = await admit(input.gesture);
  if (signal.aborted) {
    throw new Error('This turn was replaced before it started.');
  }
  return { type: 'turnAdmitted', turn };
});
