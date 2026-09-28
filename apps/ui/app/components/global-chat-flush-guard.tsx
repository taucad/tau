/**
 * GlobalChatFlushGuard
 *
 * Single app-shell flush guard that flushes every live composer record when
 * the page becomes hidden. Replaces the per-route
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
 * - On hidden preparation, asks the store to flush every composer record
 *   (`flushComposerRecords`, R9). The host log already owns chat transcripts,
 *   so there is no message-persistence actor to flush.
 *   Disposed chats (e.g. a focused chat closed mid-session) are not
 *   touched because they are no longer in the store's snapshot.
 *
 * Project-specific flushes (`projectRef.flushNow`, `editorRef.flushNow`)
 * stay in the project route because they are scoped to that subtree.
 */

import type { ReactNode } from 'react';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

export function GlobalChatFlushGuard(): ReactNode {
  const store = useChatSessionStore();

  useFlushOnClose(async () => store.flushComposerRecords(), { stage: 'producer' });

  return null;
}
