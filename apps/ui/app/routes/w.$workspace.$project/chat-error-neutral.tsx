import { memo } from 'react';
import { CircleAlert, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

/**
 * A turn the server refused for credit or a provider account while Tau cannot tell whether this server sells credit
 * (adaptive app deployment mode, the surface table: the display mode is `unknown`): no purchase, no operator billing
 * link and no claim about charging, only a retry.
 *
 * @param props - The card's class.
 * @returns The card.
 */
export const ChatErrorNeutral = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const { regenerate } = useChatActions();
  return (
    <ChatErrorCard
      tone='neutral'
      icon={CircleAlert}
      className={className}
      title='Tau could not run this turn'
      description='This server refused the request. Try again in a moment.'
      actions={
        <Button
          variant='outline'
          size='xs'
          onClick={() => {
            regenerate();
          }}
        >
          <RefreshCcw className='size-3.5' />
          Try again
        </Button>
      }
    />
  );
});
