import { useEffect, useRef, useState } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { useProject } from '#hooks/use-project.js';

/** Applies the generated title for the first user message of a new chat. */
export function useActiveChatNaming({
  activeChat,
  firstMessage,
  isProjectLoading,
  isChatsLoading,
  applyGeneratedChatName,
}: {
  readonly activeChat: ChatRecord | undefined;
  readonly firstMessage?: MyUIMessage;
  readonly isProjectLoading: boolean;
  readonly isChatsLoading: boolean;
  readonly applyGeneratedChatName: (chatId: string, name: string) => Promise<unknown>;
}): boolean {
  const client = useProjectNameClient();
  const { projectId } = useProject();
  const attemptedChatId = useRef<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (
      !activeChat ||
      isProjectLoading ||
      isChatsLoading ||
      activeChat.name !== 'New chat' ||
      !firstMessage ||
      attemptedChatId.current === activeChat.id
    ) {
      return;
    }

    attemptedChatId.current = activeChat.id;
    const firstText = firstMessage.parts.find((part) => part.type === 'text');
    const text = firstText?.type === 'text' ? firstText.text : '';
    let cancelled = false;
    setIsGenerating(true);
    const generateChatName = async (): Promise<void> => {
      try {
        const name = await client.generate({ projectId, text });
        const trimmed = name.trim();
        if (trimmed) {
          await applyGeneratedChatName(activeChat.id, trimmed);
        }
      } catch (error) {
        console.error('Failed to generate chat name:', error);
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    };
    void generateChatName();
    return () => {
      cancelled = true;
    };
  }, [activeChat, firstMessage, applyGeneratedChatName, client, isChatsLoading, isProjectLoading, projectId]);

  return isGenerating;
}
