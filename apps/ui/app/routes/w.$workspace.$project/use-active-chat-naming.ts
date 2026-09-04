import { useEffect, useRef, useState } from 'react';
import type { Chat } from '@taucad/chat';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { useProject } from '#hooks/use-project.js';

/** Applies the generated title for the first user message of a new chat. */
export function useActiveChatNaming({
  activeChat,
  isProjectLoading,
  isChatsLoading,
  applyGeneratedChatName,
}: {
  readonly activeChat: Chat | undefined;
  readonly isProjectLoading: boolean;
  readonly isChatsLoading: boolean;
  readonly applyGeneratedChatName: (chatId: string, name: string) => Promise<unknown>;
}): boolean {
  const client = useProjectNameClient();
  const { projectId } = useProject();
  const attemptedChatId = useRef<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const firstMessage = activeChat?.messages[0];
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
  }, [activeChat, applyGeneratedChatName, client, isChatsLoading, isProjectLoading, projectId]);

  return isGenerating;
}
