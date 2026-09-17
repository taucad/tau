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
 * - On hidden preparation, calls `flushNow` on every session's
 *   `persistenceActorRef` and asks the store to flush every composer record
 *   (`flushComposerRecords`, R9). The producer stage resolves only once the
 *   persistence actors are idle and no record write is on the wire, so
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
      const acknowledgements: Array<Promise<unknown>> = [store.flushComposerRecords()];
      for (const chatId of store.list()) {
        const session = store.get(chatId);
        if (!session) {
          continue;
        }
        session.persistenceActorRef.send({ type: 'flushNow' });
        acknowledgements.push(
          waitFor(session.persistenceActorRef, (state) => state.matches({ messagePersistence: 'idle' })),
        );
      }
      await Promise.all(acknowledgements);
    },
    { stage: 'producer' },
  );

  return null;
}
