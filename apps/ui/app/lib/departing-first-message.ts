/**
 * The new project's first message on its way from Home to the project's chat (WP-12 with WP-07 step 5).
 *
 * Home's composer clears at Enter and the project route then opens: the frame, the chat gate and the transcript's load
 * each draw the chat lane before the chat's record has the message. Until the transcript draws it as a measured row,
 * the lane draws it here, at the row's place, so the person's own words never leave the screen. Page-local and in
 * memory: a reload reads the chat's record, which holds the message.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';

/** The project's route scope, `<workspace>/<project>` slugs as the route names them. */
type DepartingScope = string;

/**
 * How long a message may wait to be drawn by its chat before the lane stops standing in for it, in ms. Past it the chat
 * says what it holds (an open that failed, a record without the message), never a row it does not have.
 */
export const departingFirstMessageLimit = 120_000;

let departing: Readonly<{ scope: DepartingScope; text: string }> | undefined;
let standInExpiry: ReturnType<typeof setTimeout> | undefined;
/* Every lane drawing the stand-in, told when it changes. */
const changes = new Topic<undefined>();

const subscribe = (listener: () => void): (() => void) => changes.subscribe(listener);

/**
 * Name the message leaving for a new project's chat. One at a time: a newer one replaces it.
 *
 * @param scope - The new project's route scope, `<workspace>/<project>`.
 * @param text - The message's text.
 */
export function departFirstMessage(scope: DepartingScope, text: string): void {
  departing = { scope, text };
  clearTimeout(standInExpiry);
  standInExpiry = setTimeout(() => {
    arriveFirstMessage(scope);
  }, departingFirstMessageLimit);
  changes.emit(undefined);
}

/**
 * The chat drew the message itself: the lane stops drawing it.
 *
 * @param scope - The project's route scope.
 */
export function arriveFirstMessage(scope: DepartingScope): void {
  if (departing?.scope !== scope) {
    return;
  }
  departing = undefined;
  clearTimeout(standInExpiry);
  standInExpiry = undefined;
  changes.emit(undefined);
}

/**
 * The text of the message leaving for this project's chat, if one is.
 *
 * @param scope - The project's route scope.
 * @returns The text, or `undefined`.
 */
export function departingFirstMessageOf(scope: DepartingScope): string | undefined {
  return departing?.scope === scope ? departing.text : undefined;
}

/**
 * The text of the message leaving for this project's chat, kept current.
 *
 * @param scope - The project's route scope.
 * @returns The text, or `undefined`.
 */
export function useDepartingFirstMessage(scope: DepartingScope): string | undefined {
  const read = useCallback(() => departingFirstMessageOf(scope), [scope]);
  return useSyncExternalStore(subscribe, read, () => undefined);
}
