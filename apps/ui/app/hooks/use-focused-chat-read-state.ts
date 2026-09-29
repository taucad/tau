import { useCallback, useEffect, useMemo } from 'react';
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
 * the chat through its newest attention row. The trigger is the store's own
 * unread answer. A failure to read or write the project's record is toasted
 * here, once per project route.
 */
export function useFocusedChatReadState(): void {
  const { projectId, editorRef } = useProject();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const chatSessions = useChatSessionStore();
  const unread = useChatSidebarStatus(projectId, focusedChatId ?? '')?.unread === true;
  const unreadRecord = useMemo(() => chatSessions.unreadRecordRef(projectId), [chatSessions, projectId]);
  useComposerRecordToasts(unreadRecord);

  const clearUnread = useCallback(() => {
    if (focusedChatId === undefined || !isDocumentActive()) {
      return;
    }
    if (unread || chatSessions.isUnread(focusedChatId)) {
      chatSessions.markViewed(focusedChatId);
    }
  }, [chatSessions, focusedChatId, unread]);

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
