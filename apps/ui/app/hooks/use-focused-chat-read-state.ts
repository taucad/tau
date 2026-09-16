import { useCallback, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';

const isDocumentActive = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.visibilityState === 'visible' && document.hasFocus();
};

/**
 * Clears unread state only while the focused chat is actually visible to the user.
 *
 * The store is the one writer of unread (D9): `markViewed` clears the chat's
 * machine and the project's unread record together. The trigger is the chat's
 * `read` region, which the store restores from that record, or the record
 * itself before the machine has heard.
 */
export function useFocusedChatReadState(): void {
  const { projectId, editorRef } = useProject();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const chatSessions = useChatSessionStore();
  const unread = useChatSidebarStatus(projectId, focusedChatId ?? '')?.unread === true;

  const clearUnread = useCallback(() => {
    if (focusedChatId === undefined || !isDocumentActive()) {
      return;
    }
    if (unread || chatSessions.isUnread(focusedChatId)) {
      chatSessions.markViewed(focusedChatId);
    }
  }, [chatSessions, focusedChatId, unread]);

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
