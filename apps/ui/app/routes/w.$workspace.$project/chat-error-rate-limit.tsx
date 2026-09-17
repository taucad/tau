import { memo } from 'react';
import type React from 'react';
import { Clock, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

export const ChatErrorRateLimit = memo(function ({
  className,
  title = 'Rate limit exceeded',
  description = 'Too many requests. Please wait a moment before trying again.',
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
              Try again in {retryAfterSeconds} {retryAfterSeconds === 1 ? 'second' : 'seconds'}.
            </p>
          )}
        </>
      }
      actions={
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            continueChat();
          }}
        >
          <RefreshCcw className='size-3.5' />
          Try again
        </Button>
      }
    />
  );
});
