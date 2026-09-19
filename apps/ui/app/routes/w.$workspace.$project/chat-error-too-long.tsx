import { memo } from 'react';
import type React from 'react';
import { Bot, MessageSquarePlus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

/**
 * A chat only a new conversation clears: compaction could not make room
 * (`NO_EVICTABLE_HISTORY`) or gave up on trying (`CIRCUIT_BREAKER_OPEN`).
 *
 * A limit is a state, not an error, so this reads as a neutral notice with the
 * one action that works. Resuming or retrying would meet the same refusal, so
 * neither is offered; the chat itself stays readable.
 */
export const ChatErrorTooLong = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const {
    execution: { execution },
  } = useChatComposer();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();

  return (
    <ChatErrorCard
      tone='neutral'
      icon={Bot}
      className={className}
      title='This chat is too long to continue'
      description='Tau could not make room for the next step. Start a new chat; this one stays readable.'
      actions={
        <Button
          variant='outline'
          size='sm'
          disabled={!canOpenNewChat}
          onClick={() => {
            void openNewChat({ activeExecution: execution });
          }}
        >
          <MessageSquarePlus className='size-3.5' />
          New chat
        </Button>
      }
    />
  );
});
