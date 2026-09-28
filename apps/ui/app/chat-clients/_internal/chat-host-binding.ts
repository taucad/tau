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

/**
 * Publish how this chat admits a turn.
 *
 * @param chatId - The chat these services belong to.
 * @param admit - The admission the chat's session actor invokes.
 * @returns The unpublication, for the publisher's effect cleanup.
 * @public
 */
export const publishChatTurnAdmission = (chatId: string, admit: ChatTurnAdmit): (() => void) => {
  admissionsByChat.set(chatId, admit);
  return () => {
    if (admissionsByChat.get(chatId) === admit) {
      admissionsByChat.delete(chatId);
    }
  };
};

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
  const admit = admissionsByChat.get(input.chatId);
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
