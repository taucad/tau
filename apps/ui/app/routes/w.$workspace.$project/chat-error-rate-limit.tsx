import { memo, useEffect, useState } from 'react';
import type React from 'react';
import { Clock, Play, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

/** How often the countdown redraws; the label shows whole seconds. Milliseconds. */
const countdownTickMilliseconds = 250;

const secondsLabel = (seconds: number): string => `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;

/**
 * Counts down beside Resume to the moment the chat resumes on its own.
 *
 * The label only: the wait and the resume are the chat's session machine's (audit R5), so unmounting this label, or
 * remounting it, neither stops nor restarts the resume. Its tick redraws the seconds and nothing else.
 *
 * @param properties - When the chat resumes, in epoch milliseconds.
 * @returns The countdown label.
 */
export function ResumeCountdown({ resumeAt }: { readonly resumeAt: number }): React.JSX.Element {
  const [readAt, setReadAt] = useState(() => Date.now());

  useEffect(() => {
    const tick = globalThis.setInterval(() => {
      setReadAt(Date.now());
    }, countdownTickMilliseconds);
    return () => {
      globalThis.clearInterval(tick);
    };
  }, []);

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
 * A provider's `RATE_LIMITED` refusal is transient, so the chat resumes the
 * run on its own after the wait Codex would take, until the run's automatic
 * retries are spent (`#utils/run-auto-resume`). The chat's session machine
 * waits it out; with `countdown` this card counts down beside Resume.
 */
export const ChatErrorRateLimit = memo(function ({
  className,
  resumable,
  title,
  description,
  retryAfterSeconds,
  countdown,
}: {
  readonly className?: string;
  /** Whether the host will continue this run rather than replay it. */
  readonly resumable: boolean;
  readonly title?: string;
  readonly description?: string;
  /** Seconds the gateway asked the client to wait, from its Retry-After header. */
  readonly retryAfterSeconds?: number;
  /** The automatic resume the chat is waiting out; only a resumable `RATE_LIMITED` failure has one. */
  readonly countdown?: Readonly<{ resumeAt: number }>;
}): React.JSX.Element {
  const { continueChat, regenerate } = useChatActions();
  const heading = title ?? (resumable ? 'Rate limit reached' : 'Rate limit exceeded');
  const reason =
    description ??
    (resumable
      ? 'The model provider asked Tau to wait.'
      : 'Too many requests. Please wait a moment before trying again.');

  const counting = countdown !== undefined;

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
          {countdown === undefined ? undefined : <ResumeCountdown resumeAt={countdown.resumeAt} />}
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              // A resumable wait interrupted a turn the host still holds whole, so
              // this re-issues the one refused call; anything else dispatches the
              // turn afresh, which is what the label says. Either gesture ends the
              // chat's own wait, so it never resumes a second time.
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
