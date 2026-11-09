import { memo, useCallback, useMemo, useState } from 'react';
import type React from 'react';
import { Play, RefreshCcw, WifiOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';
import { ResumeCountdown } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';
import {
  nextProviderUnavailableRetry,
  providerUnavailableRetryDelayMilliseconds,
  recordProviderUnavailableAutoResume,
} from '#utils/run-auto-resume.js';

/**
 * Tau or the model provider could not be reached.
 *
 * The category routes several codes here and the host resumes only some of
 * them (`BILLING_RECOVERY_UNAVAILABLE` ends its run for good), so the promise
 * and the verb follow `resumable`, never the card.
 *
 * With `autoResume` (a resumable `PROVIDER_UNAVAILABLE`), the card resumes the run once on its own after a short wait,
 * counting down beside Resume (`#utils/run-auto-resume`, regression review R6).
 */
export const ChatErrorServiceUnavailable = memo(function ({
  className,
  resumable,
  title = 'Unable to reach Tau',
  description,
  autoResume,
}: {
  readonly className?: string;
  /** Whether the host will continue this run rather than replay it. */
  readonly resumable: boolean;
  readonly title?: string;
  readonly description?: string;
  /** The failed run attempt to resume automatically; only a resumable `PROVIDER_UNAVAILABLE` failure passes one. */
  readonly autoResume?: Readonly<{ runId: string; attempt: number }>;
}): React.JSX.Element {
  const { continueChat, regenerate } = useChatActions();
  // A click resumes now, so the countdown must not resume a second time.
  const [resumedByHand, setResumedByHand] = useState(false);
  const runId = autoResume?.runId;
  const attempt = autoResume?.attempt;
  const counting = useMemo(
    () =>
      resumable &&
      !resumedByHand &&
      runId !== undefined &&
      attempt !== undefined &&
      nextProviderUnavailableRetry(runId, attempt) !== undefined,
    [resumable, resumedByHand, runId, attempt],
  );
  const resumeAutomatically = useCallback(() => {
    if (runId === undefined || attempt === undefined || nextProviderUnavailableRetry(runId, attempt) === undefined) {
      return;
    }
    recordProviderUnavailableAutoResume(runId, attempt);
    continueChat();
  }, [runId, attempt, continueChat]);
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
          {counting ? (
            <ResumeCountdown
              key={`${runId}:${attempt}`}
              resumeAfterMilliseconds={providerUnavailableRetryDelayMilliseconds}
              onResume={resumeAutomatically}
            />
          ) : undefined}
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              if (resumable) {
                setResumedByHand(true);
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
