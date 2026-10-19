import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Clock, Play, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';
import {
  nextRateLimitRetry,
  rateLimitRetryDelayMilliseconds,
  recordRateLimitAutoResume,
} from '#utils/rate-limit-auto-resume.js';

/** How often the countdown redraws; the label shows whole seconds. Milliseconds. */
const countdownTickMilliseconds = 250;

const secondsLabel = (seconds: number): string => `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;

/**
 * Counts down beside Resume and resumes once when the wait ends.
 *
 * Keyed by the failed attempt, so a new failure starts a new clock; the clock
 * is the card's own, as the agent-stop card's reset timer is.
 *
 * @param properties - The wait in milliseconds and the resume to call once it ends.
 * @returns The countdown label.
 */
function ResumeCountdown({
  resumeAfterMilliseconds,
  onResume,
}: {
  readonly resumeAfterMilliseconds: number;
  readonly onResume: () => void;
}): React.JSX.Element {
  const [startedAt] = useState(() => Date.now());
  const [readAt, setReadAt] = useState(startedAt);
  const resumeAt = startedAt + resumeAfterMilliseconds;

  useEffect(() => {
    const tick = globalThis.setInterval(() => {
      setReadAt(Date.now());
    }, countdownTickMilliseconds);
    const timer = globalThis.setTimeout(onResume, Math.max(resumeAt - Date.now(), 0));
    return () => {
      globalThis.clearInterval(tick);
      globalThis.clearTimeout(timer);
    };
  }, [resumeAt, onResume]);

  return (
    <span role='timer' className='text-xs text-muted-foreground tabular-nums'>
      Resuming in {secondsLabel(Math.max(Math.ceil((resumeAt - readAt) / 1000), 1))}
    </span>
  );
}

/**
 * A 429 the gateway answered, from the model provider's pacing or from Tau's
 * own funded-operation failsafe.
 *
 * The category routes several codes here and the host resumes only some of
 * them, so the promise and the verb follow `resumable` rather than the card:
 * a `FUNDED_OPERATION_LIMIT` ends its run for good, and saying the turn is
 * saved would be a promise the next click breaks.
 *
 * A provider's `RATE_LIMITED` refusal is transient, so with `autoResume` the
 * card resumes the run on its own after the wait Codex would take, counting
 * down beside Resume, until the run's automatic retries are spent
 * (`#utils/rate-limit-auto-resume`).
 */
export const ChatErrorRateLimit = memo(function ({
  className,
  resumable,
  title,
  description,
  retryAfterSeconds,
  autoResume,
}: {
  readonly className?: string;
  /** Whether the host will continue this run rather than replay it. */
  readonly resumable: boolean;
  readonly title?: string;
  readonly description?: string;
  /** Seconds the gateway asked the client to wait, from its Retry-After header. */
  readonly retryAfterSeconds?: number;
  /** The failed run attempt to resume automatically; only a resumable `RATE_LIMITED` failure passes one. */
  readonly autoResume?: Readonly<{ runId: string; attempt: number }>;
}): React.JSX.Element {
  const { continueChat, regenerate } = useChatActions();
  const heading = title ?? (resumable ? 'Rate limit reached' : 'Rate limit exceeded');
  const reason =
    description ??
    (resumable
      ? 'The model provider asked Tau to wait.'
      : 'Too many requests. Please wait a moment before trying again.');

  // A click resumes now, so the countdown must not resume a second time.
  const [resumedByHand, setResumedByHand] = useState(false);
  const runId = autoResume?.runId;
  const attempt = autoResume?.attempt;
  const retry = useMemo(
    () =>
      resumable && !resumedByHand && runId !== undefined && attempt !== undefined
        ? nextRateLimitRetry(runId, attempt)
        : undefined,
    [resumable, resumedByHand, runId, attempt],
  );
  const resumeAfterMilliseconds = useMemo(
    () =>
      retry === undefined
        ? undefined
        : rateLimitRetryDelayMilliseconds({
            retry,
            ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
          }),
    [retry, retryAfterSeconds],
  );
  // The countdown re-arms when `continueChat` changes, so the budget is checked again here:
  // a failed attempt already resumed is never resumed twice.
  const resumeAutomatically = useCallback(() => {
    if (runId === undefined || attempt === undefined || nextRateLimitRetry(runId, attempt) === undefined) {
      return;
    }
    recordRateLimitAutoResume(runId, attempt);
    continueChat();
  }, [runId, attempt, continueChat]);
  const counting = resumeAfterMilliseconds !== undefined;

  return (
    <ChatErrorCard
      tone='warning'
      icon={Clock}
      className={className}
      title={heading}
      description={
        <>
          <p>{reason}</p>
          {retryAfterSeconds === undefined || counting ? undefined : (
            <p>
              {resumable ? 'Resume' : 'Try again'} in {secondsLabel(retryAfterSeconds)}.
            </p>
          )}
          {resumable ? <p>{turnSavedSentence}</p> : undefined}
        </>
      }
      actions={
        <>
          {counting ? (
            <ResumeCountdown
              key={`${runId}:${attempt}`}
              resumeAfterMilliseconds={resumeAfterMilliseconds}
              onResume={resumeAutomatically}
            />
          ) : undefined}
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              // A resumable wait interrupted a turn the host still holds whole, so
              // this re-issues the one refused call; anything else dispatches the
              // turn afresh, which is what the label says.
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
