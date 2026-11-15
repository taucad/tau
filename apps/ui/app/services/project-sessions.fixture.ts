/**
 * The live project sessions, as the app runtime hands the sessions registry's live set to the chat store (A7c), for
 * rows that compose the store without the app runtime: a record a row moves, whose listeners hear each move.
 */
import { Topic } from '@taucad/events';
import type { LiveProjectSessions } from '#services/chat-session-store.js';

/** A live-sessions stand-in. @public */
export type ProjectSessionsStandIn = Readonly<{
  get: () => LiveProjectSessions;
  subscribe: (listener: () => void) => () => void;
  /** Make a project's session live, or take it out of the live set with `undefined`; every listener hears it. */
  set: (projectId: string, ref: LiveProjectSessions[string] | undefined) => void;
}>;

/**
 * Build a live-sessions stand-in.
 *
 * @returns The stand-in, with no session live.
 * @public
 */
export function projectSessionsStandIn(): ProjectSessionsStandIn {
  let current: LiveProjectSessions = {};
  const moves = new Topic<void>({ name: 'projectSessionsStandIn.moves' });
  return {
    get: () => current,
    subscribe: (listener) => moves.subscribe(listener),
    set: (projectId, ref) => {
      const { [projectId]: _left, ...rest } = current;
      current = ref === undefined ? rest : { ...rest, [projectId]: ref };
      moves.emit(undefined);
    },
  };
}
