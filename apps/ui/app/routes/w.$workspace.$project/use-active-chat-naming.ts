import { useEffect, useRef, useState } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { useProject } from '#hooks/use-project.js';

/**
 * Milliseconds naming waits for the first model step to answer before it runs anyway (chat performance WP-05,
 * server audit S-09). A step that never answers must not leave the chat unnamed.
 */
export const namingDeferral = 5000;

/**
 * Applies the generated title for the first user message of a new chat.
 *
 * The name request is a funded call of its own, and it took the same request-pool connections and account
 * row lock as the chat's first model step, so it waits until that step has answered (`isAwaitingFirstStep`
 * goes false) or {@link namingDeferral} passes, whichever is first.
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
  const [deferredChatId, setDeferredChatId] = useState<string | undefined>(undefined);
  const isDeferred = isAwaitingFirstStep && activeChat?.name === 'New chat' && deferredChatId !== activeChat.id;
  const deferredFor = isDeferred ? activeChat.id : undefined;

  useEffect(() => {
    if (deferredFor === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      setDeferredChatId(deferredFor);
    }, namingDeferral);
    return () => {
      clearTimeout(timer);
    };
  }, [deferredFor]);

  useEffect(() => {
    if (
      !activeChat ||
      isProjectLoading ||
      isChatsLoading ||
      isDeferred ||
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
    isDeferred,
    isProjectLoading,
    projectId,
  ]);

  return isGenerating;
}
