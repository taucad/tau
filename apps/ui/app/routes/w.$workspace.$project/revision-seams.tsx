import { useEffect, useMemo, useRef } from 'react';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChats } from '#hooks/use-chats.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { computeAbandonedTurnIds, latestTurnHasDesignOps } from '#lib/file-restore-timeline.js';

/**
 * Wires the two chat-store seams the `revisionMachine` needs into the focused
 * session. Mounted inside the chat history (below `ActiveChatProvider`), it
 * renders nothing.
 *
 * - **Seam 1 (fork):** a new user turn (`dispatchRequest{kind:'send'}`) while
 *   the head is behind the tip forks the timeline — the abandoned tail is
 *   marked (R9). The boundary is the head Revision itself (compared by Revision
 *   order, not a timestamp).
 * - **Seam 2 (advance):** terminal persistence emits advance the head back
 *   onto the tip (`headTurnId = ''`) only when the settled turn contains a
 *   committed design-file mutation. Transparent retries emit no terminal
 *   event and therefore never expose a partial revision.
 */
export function RevisionSeams(): undefined {
  const actor = useRevisionActor();
  const { activeChatId } = useActiveChatSession();
  const store = useChatSessionStore();
  const { projectId } = useProject();
  const { chats } = useChats(projectId, { includeDeleted: true });
  const projectChatIds = useMemo(() => chats.map((chat) => chat.id), [chats]);
  const { revisions, headRevision } = useRevisions();

  // The focused fork subscription reads fresh derived state through a ref so
  // it never closes over a stale revisions snapshot.
  const latest = useRef({ revisions, headRevision });
  latest.current = { revisions, headRevision };

  // Seam 2 — completion is project-wide, not focused-chat-only. Rebind on
  // store membership so a background session acquired after mount is covered.
  useEffect(() => {
    let terminalCleanups: Array<() => void> = [];

    const bindTerminalEvents = (): void => {
      for (const cleanup of terminalCleanups) {
        cleanup();
      }
      terminalCleanups = [];

      for (const chatId of projectChatIds) {
        const session = store.get(chatId);
        if (!session) {
          continue;
        }
        const settleTurn = ({ messages }: { messages: Parameters<typeof latestTurnHasDesignOps>[0] }): void => {
          if (latestTurnHasDesignOps(messages)) {
            actor.send({ type: 'TURN_COMPLETED' });
          }
        };
        const finishedSubscription = session.persistenceActorRef.on('applyFinishedRequest', settleTurn);
        const stoppedSubscription = session.persistenceActorRef.on('applyStoppedRequest', settleTurn);
        const resumedSubscription = session.persistenceActorRef.on('applyResumedRequest', settleTurn);
        terminalCleanups.push(() => {
          finishedSubscription.unsubscribe();
          stoppedSubscription.unsubscribe();
          resumedSubscription.unsubscribe();
        });
      }
    };

    bindTerminalEvents();
    const unsubscribeMembership = store.subscribeMembership(bindTerminalEvents);
    return () => {
      unsubscribeMembership();
      for (const cleanup of terminalCleanups) {
        cleanup();
      }
    };
  }, [store, actor, projectChatIds]);

  // Seam 1 — fork dispatches only originate from the focused composer.
  useEffect(() => {
    const session = store.get(activeChatId);
    if (!session) {
      return undefined;
    }

    const forkSubscription = session.persistenceActorRef.on('dispatchRequest', ({ request }) => {
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

    return forkSubscription.unsubscribe;
  }, [store, activeChatId, actor]);

  return undefined;
}
