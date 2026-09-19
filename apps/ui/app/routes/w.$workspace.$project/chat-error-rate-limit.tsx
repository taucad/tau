import { memo } from 'react';
import type React from 'react';
import { Clock, Play, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

/**
 * A 429 the gateway answered, from the model provider's pacing or from Tau's
 * own funded-operation failsafe.
 *
 * The category routes several codes here and the host resumes only some of
 * them, so the promise and the verb follow `resumable` rather than the card:
 * a `FUNDED_OPERATION_LIMIT` ends its run for good, and saying the turn is
 * saved would be a promise the next click breaks.
 */
export const ChatErrorRateLimit = memo(function ({
  className,
  resumable,
  title,
  description,
  retryAfterSeconds,
}: {
  readonly className?: string;
  /** Whether the host will continue this run rather than replay it. */
  readonly resumable: boolean;
  readonly title?: string;
  readonly description?: string;
  /** Seconds the gateway asked the client to wait, from its Retry-After header. */
  readonly retryAfterSeconds?: number;
}): React.JSX.Element {
  const { continueChat } = useChatActions();
  const heading = title ?? (resumable ? 'Rate limit reached' : 'Rate limit exceeded');
  const reason =
    description ??
    (resumable
      ? 'The model provider asked Tau to wait.'
      : 'Too many requests. Please wait a moment before trying again.');

  return (
    <ChatErrorCard
      tone='warning'
      icon={Clock}
      className={className}
      title={heading}
      description={
        <>
          <p>{reason}</p>
          {retryAfterSeconds === undefined ? undefined : (
            <p>
              {resumable ? 'Resume' : 'Try again'} in {retryAfterSeconds}{' '}
              {retryAfterSeconds === 1 ? 'second' : 'seconds'}.
            </p>
          )}
          {resumable ? <p>{turnSavedSentence}</p> : undefined}
        </>
      }
      actions={
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            // A resumable wait interrupted a turn the host still holds whole, so
            // this re-issues the one refused call; anything else dispatches the
            // turn afresh, which is what the label says.
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
