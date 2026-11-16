/**
 * The project focus has the person on, as the app runtime hands it to the chat store and the sessions (A7b), for rows
 * that compose either without the app runtime: a value a row moves, whose listeners hear each move.
 */
import { Topic } from '@taucad/events';

/** A focused-project stand-in. @public */
export type FocusedProjectStandIn = Readonly<{
  get: () => string | undefined;
  subscribe: (listener: () => void) => () => void;
  /** Move focus; every listener hears it. */
  set: (projectId: string | undefined) => void;
}>;

/**
 * Build a focused-project stand-in.
 *
 * @param initial - The project focus starts on, if any.
 * @returns The stand-in.
 * @public
 */
export function focusedProjectStandIn(initial?: string): FocusedProjectStandIn {
  let current = initial;
  const moves = new Topic<void>({ name: 'focusedProjectStandIn.moves' });
  return {
    get: () => current,
    subscribe: (listener) => moves.subscribe(listener),
    set: (projectId) => {
      current = projectId;
      moves.emit(undefined);
    },
  };
}
