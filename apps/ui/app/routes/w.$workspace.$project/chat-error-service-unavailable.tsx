import { memo } from 'react';
import type React from 'react';
import { RefreshCcw, WifiOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

export const ChatErrorServiceUnavailable = memo(function ({
  className,
  title = 'Unable to reach Tau',
  description = "We couldn't connect to the Tau service. This could be due to a network issue or the service may be temporarily unavailable. Please check your connection and try again.",
}: {
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
}): React.JSX.Element {
  const { continueChat } = useChatActions();

  return (
    <ChatErrorCard
      tone='warning'
      icon={WifiOff}
      className={className}
      title={title}
      description={description}
      actions={
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            // Recover the interrupted stream without slicing the trailing
            // assistant tail that the user already saw.
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
