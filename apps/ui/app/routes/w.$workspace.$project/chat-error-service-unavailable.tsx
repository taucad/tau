import { memo } from 'react';
import type React from 'react';
import { Play, WifiOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

export const ChatErrorServiceUnavailable = memo(function ({
  className,
  title = 'Unable to reach Tau',
  description = 'Check your connection.',
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
      description={
        <>
          <p>{description}</p>
          <p>{turnSavedSentence}</p>
        </>
      }
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
          <Play className='size-3.5' />
          Resume
        </Button>
      }
    />
  );
});
