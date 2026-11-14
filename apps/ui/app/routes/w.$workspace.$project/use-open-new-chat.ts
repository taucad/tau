import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { Chat } from '@taucad/chat';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { projectChatUrl } from '#utils/project-url.utils.js';

/**
 * Create an empty chat in the current project and open it with its composer focused.
 *
 * @returns `openNewChat`, which accepts the new chat's execution when it should
 * keep the current agent, and whether the project route is ready for it.
 */
export function useOpenNewChat(): {
  readonly openNewChat: (options?: { readonly activeExecution?: Chat['activeExecution'] }) => Promise<void>;
  readonly isReady: boolean;
} {
  const { projectId } = useProject();
  const { createChat } = useChats(projectId, { enabled: false });
  const navigate = useNavigate();
  const chatSessions = useChatSessionStore();
  const slugs = useProjectSlugs(projectId);

  const openNewChat = useCallback(
    async (options?: { readonly activeExecution?: Chat['activeExecution'] }): Promise<void> => {
      if (slugs.status !== 'resolved') {
        return;
      }
      const chat = await createChat({
        name: 'New chat',
        messages: [],
        ...(options?.activeExecution === undefined ? {} : { activeExecution: options.activeExecution }),
      });
      // Created empty here, so the lane shows its empty state at once rather than waiting for the log (I21).
      chatSessions.noteCreatedEmpty(chat.id);
      await navigate(projectChatUrl(slugs.value, chat.id), { state: { focusChatComposer: true } });
    },
    [chatSessions, createChat, navigate, slugs],
  );

  return { openNewChat, isReady: slugs.status === 'resolved' };
}
