import { memo } from 'react';
import type React from 'react';
import { Play, RefreshCcw, WifiOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';
import { ResumeCountdown } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';

/**
 * Tau or the model provider could not be reached.
 *
 * The category routes several codes here and the host resumes only some of
 * them (`BILLING_RECOVERY_UNAVAILABLE` ends its run for good), so the promise
 * and the verb follow `resumable`, never the card.
 *
 * A resumable `PROVIDER_UNAVAILABLE` resumes once on its own after a short wait (`#utils/run-auto-resume`, regression
 * review R6). The chat's session machine waits it out; with `countdown` this card counts down beside Resume.
 */
export const ChatErrorServiceUnavailable = memo(function ({
  className,
  resumable,
  title = 'Unable to reach Tau',
  description,
  countdown,
}: {
  readonly className?: string;
  /** Whether the host will continue this run rather than replay it. */
  readonly resumable: boolean;
  readonly title?: string;
  readonly description?: string;
  /** The automatic resume the chat is waiting out; only a resumable `PROVIDER_UNAVAILABLE` failure has one. */
  readonly countdown?: Readonly<{ resumeAt: number }>;
}): React.JSX.Element {
  const { continueChat, regenerate } = useChatActions();
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
        <>
          {countdown === undefined ? undefined : <ResumeCountdown resumeAt={countdown.resumeAt} />}
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              // Either gesture ends the chat's own wait, so it never resumes a second time.
              if (resumable) {
                continueChat();
              } else {
                regenerate();
              }
            }}
          >
            {resumable ? <Play className='size-3.5' /> : <RefreshCcw className='size-3.5' />}
            {resumable ? 'Resume' : 'Try again'}
          </Button>
        </>
      }
    />
  );
});
