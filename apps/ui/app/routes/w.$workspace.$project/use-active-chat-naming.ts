import { useEffect, useRef, useState } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { useProject } from '#hooks/use-project.js';

/**
 * Applies the generated title for the first user message of a new chat.
 *
 * The name request is a funded call of its own, and it took the same request-pool connections and account
 * row lock as the chat's first model step, so it waits until that step has answered (`isAwaitingFirstStep`
 * goes false; chat performance WP-05, server audit S-09). A step that never answers still ends the wait: the
 * request leaves `submitted` when it errors, times out or is stopped, so no timer of its own is needed.
 */
export function useActiveChatNaming({
  activeChat,
  firstMessage,
  isProjectLoading,
  isChatsLoading,
  isAwaitingFirstStep = false,
  applyGeneratedChatName,
}: {
  readonly activeChat: ChatRecord | undefined;
  readonly firstMessage?: MyUIMessage;
  readonly isProjectLoading: boolean;
  readonly isChatsLoading: boolean;
  /** True while the chat's request is sent and nothing has come back yet. */
  readonly isAwaitingFirstStep?: boolean;
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
      isAwaitingFirstStep ||
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
  }, [
    activeChat,
    firstMessage,
    applyGeneratedChatName,
    client,
    isChatsLoading,
    isAwaitingFirstStep,
    isProjectLoading,
    projectId,
  ]);

  return isGenerating;
}
