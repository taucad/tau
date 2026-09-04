import { useEffect, useMemo, useRef } from 'react';
import { useChats } from '#hooks/use-chats.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { computeAbandonedTurnIds } from '#lib/file-restore-timeline.js';
import { useFinalizedChatWorkspaces } from '#providers/chat-workspace-authority-provider.js';
import type { MyUIMessage } from '@taucad/chat';

/**
 * Wires the chat-store seams the `revisionMachine` needs into every live
 * project session. It renders nothing.
 *
 * - **Seam 1 (fork):** a new user turn (`dispatchRequest{kind:'send'}`) while
 *   the head is behind the tip forks the timeline — the abandoned tail is
 *   marked (R9). The boundary is the head Revision itself (compared by Revision
 *   order, not a timestamp).
 * - **Seam 2 (advance):** terminal persistence emits advance the head back
 *   onto the tip (`headTurnId = ''`) only when the settled turn contains a
 *   committed design-file mutation. Transparent retries emit no terminal
 *   event and therefore never expose a partial revision.
 * - **Seam 3 (authority):** finalized workspaces project their already-settled
 *   revision identity and branch publication into the durable graph exactly
 *   once per workspace/revision pair.
 */
export function RevisionSeams(): undefined {
  const actor = useRevisionActor();
  const store = useChatSessionStore();
  const { projectId } = useProject();
  const { chats } = useChats(projectId, { includeDeleted: true });
  const projectChatIds = useMemo(() => chats.map((chat) => chat.id), [chats]);
  const { revisions, headRevision } = useRevisions();
  const finalizedWorkspaces = useFinalizedChatWorkspaces();
  const dispatchedFinalizations = useRef(new Set<string>());

  // Dispatch subscriptions read fresh derived state through a ref so
  // it never closes over a stale revisions snapshot.
  const latest = useRef({ revisions, headRevision });
  useEffect(() => {
    latest.current = { revisions, headRevision };
  }, [headRevision, revisions]);

  useEffect(() => {
    for (const result of finalizedWorkspaces) {
      const identity = JSON.stringify([result.workspaceId, result.revisionId]);
      if (dispatchedFinalizations.current.has(identity)) {
        continue;
      }
      dispatchedFinalizations.current.add(identity);
      actor.send({ type: 'authoritativeRevisionFinalized', result });
    }
  }, [actor, finalizedWorkspaces]);

  // Fork registration and completion are project-wide. Rebind on membership
  // so a background session acquired after mount is covered.
  useEffect(() => {
    let sessionCleanups: Array<() => void> = [];

    const bindSessionEvents = (): void => {
      for (const cleanup of sessionCleanups) {
        cleanup();
      }
      sessionCleanups = [];

      for (const chatId of projectChatIds) {
        const session = store.get(chatId);
        if (!session) {
          continue;
        }
        const settleTurn = ({ messages }: { messages: readonly MyUIMessage[] }): void => {
          const turnId = messages.findLast((message) => message.role === 'user')?.id;
          if (turnId !== undefined) {
            actor.send({ type: 'DISCARD_PENDING_TURN', turnId });
          }
        };
        const dispatchSubscription = session.persistenceActorRef.on('dispatchRequest', ({ request }) => {
          if (request.kind !== 'send') {
            return;
          }
          const { revisions: revs, headRevision: head } = latest.current;
          actor.send({
            type: 'NEW_USER_TURN',
            abandonedTurnIds: computeAbandonedTurnIds(revs, head),
            atRevision: head?.n ?? 0,
            newTurnId: request.message.id,
            chatId,
            ...(head === undefined ? {} : { parentTurnId: head.messageId }),
          });
        });
        const finishedSubscription = session.persistenceActorRef.on('applyFinishedRequest', settleTurn);
        const stoppedSubscription = session.persistenceActorRef.on('applyStoppedRequest', settleTurn);
        const resumedSubscription = session.persistenceActorRef.on('applyResumedRequest', settleTurn);
        sessionCleanups.push(() => {
          dispatchSubscription.unsubscribe();
          finishedSubscription.unsubscribe();
          stoppedSubscription.unsubscribe();
          resumedSubscription.unsubscribe();
        });
      }
    };

    bindSessionEvents();
    const unsubscribeMembership = store.subscribeMembership(bindSessionEvents);
    return () => {
      unsubscribeMembership();
      for (const cleanup of sessionCleanups) {
        cleanup();
      }
    };
  }, [store, actor, projectChatIds]);

  return undefined;
}
