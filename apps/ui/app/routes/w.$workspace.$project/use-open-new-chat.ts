import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { Chat } from '@taucad/chat';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
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
  const { createChat } = useChats(projectId);
  const navigate = useNavigate();
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
      await navigate(projectChatUrl(slugs.value, chat.id), { state: { focusChatComposer: true } });
    },
    [createChat, navigate, slugs],
  );

  return { openNewChat, isReady: slugs.status === 'resolved' };
}
