import { memo } from 'react';
import type React from 'react';
import { Clock, Play } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

export const ChatErrorRateLimit = memo(function ({
  className,
  title = 'Rate limit reached',
  description = 'The model provider asked Tau to wait.',
  retryAfterSeconds,
}: {
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
  /** Seconds the gateway asked the client to wait, from its Retry-After header. */
  readonly retryAfterSeconds?: number;
}): React.JSX.Element {
  const { continueChat } = useChatActions();

  return (
    <ChatErrorCard
      tone='warning'
      icon={Clock}
      className={className}
      title={title}
      description={
        <>
          <p>{description}</p>
          {retryAfterSeconds === undefined ? undefined : (
            <p>
              Resume in {retryAfterSeconds} {retryAfterSeconds === 1 ? 'second' : 'seconds'}.
            </p>
          )}
          <p>{turnSavedSentence}</p>
        </>
      }
      actions={
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            // The wait interrupted a turn the host still holds whole, so this
            // re-issues the one refused call rather than rewinding to the
            // prompt and paying for the tool work again.
            continueChat();
          }}
        >
          <Play className='size-3.5' />
          Resume
        </Button>
      }
    />
  );
});
