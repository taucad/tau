import { memo } from 'react';
import { CircleAlert, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

export const ChatErrorCredits = memo(function ({
  className,
}: {
  readonly className?: string;
  readonly description?: string;
  readonly details?: Record<string, unknown>;
}): React.JSX.Element {
  const { continueChat } = useChatActions();
  return (
    <ChatErrorCard
      tone='neutral'
      icon={CircleAlert}
      className={className}
      title='Request could not be completed'
      description='Retry with the providers configured by this server.'
      actions={
        <Button variant='outline' size='sm' onClick={continueChat}>
          <RefreshCcw className='size-3.5' />
          Try again
        </Button>
      }
    />
  );
});
