import { Sparkles, WifiOff } from 'lucide-react';
import { messageRole } from '@taucad/chat/constants';
import { useChatRetrySnapshot, useChatSelector } from '#hooks/use-chat.js';
import { cn } from '#utils/ui.utils.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';

type ChatMessagePlanningProperties = {
  readonly messageId: string;
  readonly className?: string;
};

/** Part type for areAllPartsConcluded - only needs to check state property */
export type PartWithOptionalState = { [key: string]: unknown; state?: string };

/**
 * Check if all parts in a message have concluded.
 * Concluded states:
 * - Text/Reasoning: 'done' (or no state = complete)
 * - Tools: 'output-available' or 'output-error'
 *
 * Returns false if any part is still actively streaming or processing.
 */
export function areAllPartsConcluded(parts: readonly PartWithOptionalState[]): boolean {
  for (const part of parts) {
    // Skip parts without state (considered complete)
    if (!('state' in part) || part.state === undefined) {
      continue;
    }

    const { state } = part;

    // These are all concluded states:
    // - 'done': text/reasoning finished streaming
    // - 'output-available': tool completed successfully
    // - 'output-error': tool completed with error
    const isConcluded = state === 'done' || state === 'output-available' || state === 'output-error';

    if (!isConcluded) {
      return false;
    }
  }

  return true;
}

/**
 * Displays a "Planning next moves..." indicator when the AI is processing.
 * Shows after a user message or when an assistant message has all tool parts concluded.
 */
export function ChatMessagePlanning({
  messageId,
  className,
}: ChatMessagePlanningProperties): React.JSX.Element | undefined {
  const status = useChatSelector((state) => state.status);
  const isStreamingOrSubmitted = ['submitted', 'streaming'].includes(status);
  const { retryAttempt, retryMaxAttempts } = useChatRetrySnapshot();
  const isReconnecting = retryAttempt > 0;

  const message = useChatSelector((state) => state.messagesById.get(messageId));

  const isUser = message?.role === messageRole.user;

  // Check if this is the last message and whether we should show the planning indicator
  const shouldShowPlanningIndicator = useChatSelector((state) => {
    const { messages } = state;
    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      return false;
    }

    // Case 1: Last message is user message (no assistant response yet)
    if (lastMessage.role === messageRole.user) {
      return lastMessage.id === messageId;
    }

    // Case 2: Last message is assistant message with all parts concluded (not actively streaming)
    if (lastMessage.role === messageRole.assistant && lastMessage.id === messageId) {
      return areAllPartsConcluded(lastMessage.parts);
    }

    return false;
  });

  const isLastMessage = useChatSelector((state) => state.messages.at(-1)?.id === messageId);

  // Two display modes share this slot:
  //   - "Planning next moves..." while the AI SDK is actively streaming/submitted
  //     AND the trailing message is in the idle-between-parts posture (gate above).
  //   - "Reconnecting... N/M" while the persistence machine is between auto-retry
  //     dispatches — show under the trailing message even when parts are still
  //     streaming (mid-token / mid-tool-input disconnect); do NOT require
  //     `areAllPartsConcluded`.
  const shouldShowPlanning =
    (isStreamingOrSubmitted && shouldShowPlanningIndicator) || (isReconnecting && isLastMessage);

  if (!shouldShowPlanning) {
    return undefined;
  }

  // Add ml-2 for user messages to compensate for parent's mx-2 vs mx-4 for assistant messages
  // This ensures the planning indicator aligns with tools that appear in assistant messages
  // The parent's space-y-2 provides consistent vertical spacing for both cases
  return (
    <div className={cn(isUser ? 'ml-2' : undefined, className)}>
      <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={isReconnecting ? WifiOff : Sparkles} />
          <ChatToolCardTitle>
            {isReconnecting ? (
              <ChatToolLabel verb='Reconnecting'>
                <ChatToolDescription>{`${retryAttempt}/${retryMaxAttempts}...`}</ChatToolDescription>
              </ChatToolLabel>
            ) : (
              <ChatToolLabel verb='Planning'>
                <ChatToolDescription>next moves...</ChatToolDescription>
              </ChatToolLabel>
            )}
          </ChatToolCardTitle>
        </ChatToolCardHeader>
      </ChatToolCard>
    </div>
  );
}
