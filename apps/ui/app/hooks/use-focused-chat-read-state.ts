import { useCallback, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectManager } from '#hooks/use-project-manager.js';

const isDocumentActive = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.visibilityState === 'visible' && document.hasFocus();
};

/** Clears unread state only while the focused chat is actually visible to the user. */
export function useFocusedChatReadState(): void {
  const { projectId, editorRef } = useProject();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const { chats } = useChats(projectId);
  const { setChatUnreadState } = useProjectManager();
  const focusedChat = chats.find((chat) => chat.id === focusedChatId);

  const clearUnread = useCallback(() => {
    if (!focusedChat?.hasUnreadTurn || !isDocumentActive()) {
      return;
    }
    void setChatUnreadState(focusedChat.id, false);
  }, [focusedChat, setChatUnreadState]);

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
