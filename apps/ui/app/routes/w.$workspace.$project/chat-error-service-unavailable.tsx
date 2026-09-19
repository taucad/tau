import { memo } from 'react';
import type React from 'react';
import { Play, RefreshCcw, WifiOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

/**
 * Tau or the model provider could not be reached.
 *
 * The category routes several codes here and the host resumes only some of
 * them (`BILLING_RECOVERY_UNAVAILABLE` ends its run for good), so the promise
 * and the verb follow `resumable`, never the card.
 */
export const ChatErrorServiceUnavailable = memo(function ({
  className,
  resumable,
  title = 'Unable to reach Tau',
  description,
}: {
  readonly className?: string;
  /** Whether the host will continue this run rather than replay it. */
  readonly resumable: boolean;
  readonly title?: string;
  readonly description?: string;
}): React.JSX.Element {
  const { continueChat } = useChatActions();
  const reason =
    description ??
    (resumable
      ? 'Check your connection.'
      : "We couldn't connect to the Tau service. This could be due to a network issue or the service may be temporarily unavailable. Please check your connection and try again.");

  return (
    <ChatErrorCard
      tone='warning'
      icon={WifiOff}
      className={className}
      title={title}
      description={
        <>
          <p>{reason}</p>
          {resumable ? <p>{turnSavedSentence}</p> : undefined}
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
          {resumable ? <Play className='size-3.5' /> : <RefreshCcw className='size-3.5' />}
          {resumable ? 'Resume' : 'Try again'}
        </Button>
      }
    />
  );
});
