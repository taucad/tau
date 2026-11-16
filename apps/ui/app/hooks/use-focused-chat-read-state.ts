import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { useComposerRecordToasts } from '#hooks/use-composer-record-toasts.js';
import { isDocumentActive } from '#services/chat-session-store.js';

/**
 * Clears unread state only while the focused chat is actually visible to the user.
 *
 * The store is the one writer of read receipts (D9, PV-S8): `markViewed` reads
 * the chat through its newest attention row and clears a legacy mark. The
 * trigger is the store's own unread answer, or a legacy mark the record still
 * holds after that answer has gone false (a log with no attention row), so the
 * next page does not read the chat unread again. A failure to read or write the
 * project's record is toasted here, once per project route.
 */
export function useFocusedChatReadState(): void {
  const { projectId, editorRef } = useProject();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const chatSessions = useChatSessionStore();
  const unread = useChatSidebarStatus(projectId, focusedChatId ?? '')?.unread === true;
  const subscribeUnread = useCallback((listener: () => void) => chatSessions.subscribeUnread(listener), [chatSessions]);
  const marked = useSyncExternalStore(
    subscribeUnread,
    () => focusedChatId !== undefined && chatSessions.hasUnreadMark(focusedChatId),
    () => false,
  );
  const unreadRecord = useMemo(() => chatSessions.unreadRecordRef(projectId), [chatSessions, projectId]);
  useComposerRecordToasts(unreadRecord);

  const clearUnread = useCallback(() => {
    if (focusedChatId === undefined || !isDocumentActive()) {
      return;
    }
    if (unread || marked || chatSessions.isUnread(focusedChatId)) {
      chatSessions.markViewed(focusedChatId);
    }
  }, [chatSessions, focusedChatId, marked, unread]);

  // The store decides what a finishing turn leaves unread from this fact (R3).
  useEffect(() => {
    if (focusedChatId === undefined) {
      return undefined;
    }
    chatSessions.focusChat(focusedChatId);
    return () => {
      chatSessions.blurChat(focusedChatId);
    };
  }, [chatSessions, focusedChatId]);

  useEffect(clearUnread, [clearUnread]);

  useEffect(() => {
    window.addEventListener('focus', clearUnread);
    document.addEventListener('visibilitychange', clearUnread);
    return () => {
      window.removeEventListener('focus', clearUnread);
      document.removeEventListener('visibilitychange', clearUnread);
    };
  }, [clearUnread]);
}
