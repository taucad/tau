import { selectRunElsewhereRecheckDelay } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';

/** Where the clock reads a chat's projection and hears it change. @internal */
export type RunElsewhereSource = Readonly<{
  getProjection: (chatId: string) => ChatProjection | undefined;
  subscribeProjection: (chatId: string, listener: () => void) => () => void;
}>;

/**
 * Hear a chat's projection, and the moments another device's run changes standing with the clock alone (XD3), which no
 * store announces. One timeout is armed for the next such moment (`selectRunElsewhereRecheckDelay`), and only while a
 * foreign run is unsettled. It is re-armed when the other devices' segments change (`projection.remote`), never on
 * the chunks a live run streams.
 *
 * @param source - The chat session store.
 * @param chatId - The chat.
 * @param listener - Told on every projection change and every armed moment.
 * @returns The unsubscribe.
 * @internal
 */
export const subscribeRunElsewhere = (
  source: RunElsewhereSource,
  chatId: string,
  listener: () => void,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armedFor: ChatProjection['remote'];
  const arm = (): void => {
    clearTimeout(timer);
    timer = undefined;
    const projection = source.getProjection(chatId);
    armedFor = projection?.remote;
    const recheckDelay = projection === undefined ? undefined : selectRunElsewhereRecheckDelay(projection, Date.now());
    if (recheckDelay !== undefined) {
      timer = setTimeout(() => {
        listener();
        arm();
      }, recheckDelay);
    }
  };
  arm();
  const unsubscribe = source.subscribeProjection(chatId, () => {
    listener();
    if (source.getProjection(chatId)?.remote !== armedFor) {
      arm();
    }
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
};
