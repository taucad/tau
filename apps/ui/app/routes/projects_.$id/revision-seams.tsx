import { useEffect, useRef } from 'react';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useRevisionActor } from '#routes/projects_.$id/revision-provider.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { computeAbandonedTurnIds } from '#lib/file-restore-timeline.js';

/**
 * Wires the two chat-store seams the `revisionMachine` needs into the focused
 * session. Mounted inside the chat history (below `ActiveChatProvider`), it
 * renders nothing.
 *
 * - **Seam 1 (fork):** a new user turn (`dispatchRequest{kind:'send'}`) while
 *   the head is behind the tip forks the timeline — the abandoned tail is
 *   marked (R9). The boundary is the head Revision itself (compared by Revision
 *   order, not a timestamp).
 * - **Seam 2 (advance):** a `streaming/submitted → ready` status edge advances
 *   the head back onto the tip (`headTurnId = ''`).
 */
export function RevisionSeams(): undefined {
  const actor = useRevisionActor();
  const { activeChatId } = useActiveChatSession();
  const store = useChatSessionStore();
  const { revisions, headRevision } = useRevisions();

  // Subscriptions are created once per focused session; read fresh derived
  // state through a ref so they never close over a stale revisions snapshot.
  const latest = useRef({ revisions, headRevision });
  latest.current = { revisions, headRevision };

  // Seam 2 — turn complete advances the head.
  useEffect(() => {
    let previous = store.getStatus(activeChatId);
    return store.subscribeStatus(activeChatId, () => {
      const status = store.getStatus(activeChatId);
      if (
        (previous === 'streaming' || previous === 'submitted') &&
        status === 'ready' &&
        // Only advance once the project actually has a Revision — a chat-only
        // turn mutates no files, so it neither creates a Revision nor clears dirty.
        latest.current.revisions.length > 0
      ) {
        actor.send({ type: 'TURN_COMPLETED' });
      }
      previous = status;
    });
  }, [store, activeChatId, actor]);

  // Seam 1 — a new user turn forks when the head is behind the tip.
  useEffect(() => {
    const session = store.get(activeChatId);
    if (!session) {
      return undefined;
    }
    const subscription = session.persistenceActorRef.on('dispatchRequest', ({ request }) => {
      if (request.kind !== 'send') {
        return; // Retry / regenerate / continue re-run existing turns; edit truncates.
      }
      const { revisions: revs, headRevision: head } = latest.current;
      // The head Revision is the fork boundary; turns ordered after it are
      // abandoned by this new turn (compared by Revision order, not a timestamp).
      const abandonedTurnIds = computeAbandonedTurnIds(revs, head);
      actor.send({
        type: 'NEW_USER_TURN',
        abandonedTurnIds,
        atRevision: head?.n ?? 0,
      });
    });
    return subscription.unsubscribe;
  }, [store, activeChatId, actor]);

  return undefined;
}
