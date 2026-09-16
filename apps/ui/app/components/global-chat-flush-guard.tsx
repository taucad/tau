/**
 * GlobalChatFlushGuard
 *
 * Single app-shell flush guard that fans out a `{ type: 'flushNow' }`
 * event to every live chat session's persistence + draft actor when the
 * page becomes hidden. Replaces the per-route
 * `FlushOnCloseGuard` (project) and `HomepageChatFlushOnCloseGuard`
 * (homepage) — those guards each subscribed to a single chat, which
 * doesn't compose once concurrent chats live in `ChatSessionStore`.
 *
 * Architecture:
 * - Mounted once near the app root (`apps/ui/app/root.tsx`) inside both
 *   `<UnloadProvider>` and `<ChatSessionStoreProvider>`.
 * - Reads `useChatSessionStore()` (no subscription needed —
 *   `useFlushOnClose` stores the callback by ref, so the latest store
 *   snapshot is read at flush time, not at registration time).
 * - On hidden preparation, iterates `store.list()`, calls `flushNow` on the
 *   `persistenceActorRef` and `draftActorRef` of every session.
 *   The producer stage resolves only after both actors acknowledge idle, so
 *   revision preparation cannot cut ahead of their bytes.
 *   Disposed chats (e.g. a focused chat closed mid-session) are not
 *   touched because they are no longer in the store's snapshot.
 *
 * Project-specific flushes (`projectRef.flushNow`, `editorRef.flushNow`)
 * stay in the project route because they are scoped to that subtree.
 */

import type { ReactNode } from 'react';
import { waitFor } from 'xstate';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

export function GlobalChatFlushGuard(): ReactNode {
  const store = useChatSessionStore();

  useFlushOnClose(
    async () => {
      const acknowledgements: Array<Promise<unknown>> = [];
      for (const chatId of store.list()) {
        const session = store.get(chatId);
        if (!session) {
          continue;
        }
        session.persistenceActorRef.send({ type: 'flushNow' });
        session.draftActorRef.send({ type: 'flushNow' });
        acknowledgements.push(
          waitFor(session.persistenceActorRef, (state) => state.matches({ messagePersistence: 'idle' })),
          waitFor(
            session.draftActorRef,
            (state) => state.matches({ inputSaving: 'idle' }) && state.matches({ editSaving: 'idle' }),
          ),
        );
      }
      await Promise.all(acknowledgements);
    },
    { stage: 'producer' },
  );

  return null;
}
