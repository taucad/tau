import { memo } from 'react';
import type React from 'react';
import { Bot, MessageSquarePlus, Play, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatActions } from '#hooks/use-chat.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { chatTooLongMessage } from '#utils/error.utils.js';

/**
 * A chat whose compaction could not make room (`NO_EVICTABLE_HISTORY`) or gave
 * up on trying (`CIRCUIT_BREAKER_OPEN`).
 *
 * A limit is a state, not an error, so this reads as a neutral notice. When the
 * host retained the run, Resume keeps its work and replay remains available
 * after that safer action. An unresumable refusal can only start a new chat.
 */
export const ChatErrorTooLong = memo(function ({
  className,
  resumable = false,
}: {
  readonly className?: string;
  readonly resumable?: boolean;
}): React.JSX.Element {
  const {
    execution: { execution },
  } = useChatComposer();
  const { continueChat, regenerate } = useChatActions();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();

  return (
    <ChatErrorCard
      tone='neutral'
      icon={Bot}
      className={className}
      title='This chat is too long to continue'
      description={
        <>
          <p>{chatTooLongMessage}</p>
          {resumable ? <p>Resume to continue without losing your work.</p> : null}
        </>
      }
      actionsRowFrom='sm'
      actions={
        <>
          {resumable ? (
            <Button size='sm' onClick={continueChat}>
              <Play className='size-3.5' />
              Resume
            </Button>
          ) : null}
          {resumable ? (
            <Button variant='outline' size='sm' onClick={regenerate}>
              <RefreshCcw className='size-3.5' />
              Try again
            </Button>
          ) : null}
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
        </>
      }
    />
  );
});
