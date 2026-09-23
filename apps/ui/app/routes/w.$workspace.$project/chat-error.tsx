import { memo, useState } from 'react';
import type React from 'react';
import { Bot, ChevronRight, CircleAlert, RefreshCcw, WifiOff } from 'lucide-react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { useChatActions, useChatRetrySnapshot, useChatSelector } from '#hooks/use-chat.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { CodeViewer } from '#components/code/code-viewer.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { cn } from '@taucad/ui/utils/cn';
import { chatHistoryTidyFailureMessage, chatTurnNotStartedCode, parseErrorForPersistence } from '#utils/error.utils.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { ChatErrorPausedTurn } from '#routes/w.$workspace.$project/chat-error-paused-turn.js';
import { ChatErrorTooLong } from '#routes/w.$workspace.$project/chat-error-too-long.js';
import { ChatErrorUnauthorized } from '#routes/w.$workspace.$project/chat-error-unauthorized.js';
import { ChatErrorServiceUnavailable } from '#routes/w.$workspace.$project/chat-error-service-unavailable.js';
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { ChatErrorRateLimit } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';
import { ChatErrorTool } from '#routes/w.$workspace.$project/chat-error-tool.js';
import { ChatErrorAgentStop } from '#routes/w.$workspace.$project/chat-error-agent-stop.js';
import { ChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account.js';
import { externalAgentStopCodes, externalAgentStopSchema, isResumableRunFailure } from '@taucad/agent-host';

/**
 * Model-call failures that leave the turn whole.
 *
 * Every one of these is raised after the run was admitted and before the
 * provider's reply landed, so no tool ran on the failed call and the history
 * the host would resume from is complete. The category cannot tell them apart:
 * the masked in-stream failure arrives on an HTTP 200, which reads as
 * `generic`, and a 502 reads as `server`.
 *
 * `RUN_ABANDONED` is the host's record of a run whose document died: nothing
 * the person did failed, and the host resumes it from what it had saved.
 */
const pausedTurnCodes = new Set([
  'RUN_ABANDONED',
  'NETWORK_ERROR',
  'PROVIDER_UNAVAILABLE',
  'MALFORMED_RESPONSE',
  'UPSTREAM_REJECTED',
  'WORKER_CRASHED',
]);

/**
 * Refusals described as a chat-length problem: compaction could not make room,
 * or the gateway refused the request's size (`REQUEST_TOO_LARGE`).
 */
const chatTooLongCodes = new Set(['NO_EVICTABLE_HISTORY', 'CIRCUIT_BREAKER_OPEN', 'REQUEST_TOO_LARGE']);

/** Compaction failures whose plain-language recovery is the same kept turn. */
const chatHistoryTidyFailureCodes = new Set(['SESSION_LOG_INTEGRITY', 'SUMMARY_REQUIRED']);

/**
 * Attempts to format a string as pretty-printed JSON.
 */
function tryFormatJson(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

/**
 * The card a coded failure names for itself, or `undefined` when its category
 * decides instead.
 *
 * Kept out of the component because the status a failure carries (200 for an
 * in-stream provider failure, none at all for a host refusal) says nothing
 * about whether the turn survived it, so this is a list of codes rather than a
 * branch of the category switch.
 *
 * @param input - The parsed failure, whether the host will resume it, the card
 * class and the restart gesture a turn that never started is offered.
 * @returns The card, or `undefined` to fall through to the category switch.
 */
function codedErrorCard({
  error,
  resumable,
  className,
  onTryAgain,
}: {
  readonly error: NormalizedChatError;
  readonly resumable: boolean;
  readonly className: string;
  readonly onTryAgain: () => void;
}): React.ReactNode | undefined {
  const { code } = error;
  if (code === undefined) {
    return undefined;
  }
  const rawDetail = error.raw ? tryFormatJson(error.raw) : undefined;
  const raw = rawDetail === undefined ? {} : { raw: rawDetail };

  // The provider account behind Tau's key refused; the deployment's own card
  // says whose account it is, so the code outranks the category (a 503 relayed
  // in a 200 stream would otherwise read as a Tau outage).
  if (code === 'PROVIDER_ACCOUNT_EXHAUSTED') {
    return <ChatErrorProviderAccount className={className} description={error.message} details={error.details} />;
  }

  if (chatHistoryTidyFailureCodes.has(code)) {
    return (
      <ChatErrorPausedTurn
        className={className}
        reason={chatHistoryTidyFailureMessage}
        resumable={resumable}
        guidance='Resume to continue without losing your work.'
        canTryAgain
        {...raw}
      />
    );
  }

  if (pausedTurnCodes.has(code)) {
    return (
      <ChatErrorPausedTurn
        className={className}
        reason={error.message}
        resumable={resumable}
        icon={code === 'PROVIDER_UNAVAILABLE' || code === 'UPSTREAM_REJECTED' ? WifiOff : CircleAlert}
        {...raw}
      />
    );
  }

  // A refusal of the request itself resumes once the model or its settings
  // change; re-issuing it unchanged meets the same refusal, which is honest and
  // costs nothing.
  if (code === 'INVALID_REQUEST') {
    return (
      <ChatErrorPausedTurn
        className={className}
        title='The model refused this request'
        reason={error.message}
        resumable={resumable}
        guidance='Change the model or its settings, then resume.'
        canSwitchModel
        {...raw}
      />
    );
  }

  if (chatTooLongCodes.has(code)) {
    return <ChatErrorTooLong className={className} resumable={resumable} />;
  }

  /* Not a failure: the host was asked to continue a run it no longer holds —
   * it was already settled, or it ended in a way a resume cannot pick up. The
   * turn is whole and nothing was spent, so the card says so and offers the
   * one thing that does work, which is running the turn again. */
  if (code === 'RESUME_UNAVAILABLE') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={Bot}
        title='Nothing left to continue'
        description={error.message}
        actions={
          <Button variant='outline' size='sm' onClick={onTryAgain}>
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        }
      />
    );
  }

  // Another tab holds this chat's log. Taking it back is a leadership protocol,
  // not an error action (ruling Q6), and reloading already follows that tab.
  if (code === 'LEADERSHIP_LOST') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={Bot}
        title='This chat continued in another tab'
        description='Keep working there. Reload this page to follow along here.'
      />
    );
  }

  // The one restart that loses nothing: admission refused before a run existed.
  if (code === chatTurnNotStartedCode) {
    return (
      <ChatErrorCard
        className={className}
        tone='destructive'
        icon={CircleAlert}
        title='Tau could not start this turn'
        description={error.message}
        actions={
          <Button variant='outline' size='sm' onClick={onTryAgain}>
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        }
      />
    );
  }

  return undefined;
}

export const ChatError = memo(function ({ className }: { readonly className?: string }): React.ReactNode {
  const [genericDetailsOpen, setGenericDetailsOpen] = useState(false);
  const { retryAttempt } = useChatRetrySnapshot();
  // Derive parsed error inside selector - prefer runtime error, fallback to persisted
  const parsedError = useChatSelector((state): NormalizedChatError | undefined => {
    if (state.error) {
      return parseErrorForPersistence(state.error);
    }

    return state.persistedError;
  });
  const { continueChat } = useChatActions();

  // R7: hide the banner during transparent auto-retry; the reconnecting affordance
  // is `ChatMessagePlanning`, not this component. The early return MUST sit below
  // every hook call -- crossing the hook list with a conditional return triggers
  // React error #300 ("Rendered fewer hooks than expected") on the
  // retryAttempt 0 -> N transition, which the FloatingPanel boundary then
  // surfaces as the "Chat Unavailable" screen.
  if (retryAttempt > 0) {
    return null;
  }

  if (!parsedError) {
    return null;
  }

  // Generic fallback recovery must preserve partial assistant parts the user
  // already saw. Specialized components own auth, credits, rate-limit, and
  // tool-error actions. Credits remain the account-state "Resume" exception.
  const handleTryAgain = (): void => {
    continueChat();
  };

  // Render the generic/server error view with collapsible details
  const renderGenericError = (): React.ReactNode => {
    const formattedError = parsedError.raw ? tryFormatJson(parsedError.raw) : parsedError.message;

    return (
      <div className={cn('min-w-0', className)}>
        <Collapsible
          open={genericDetailsOpen}
          className={cn(
            'group/collapsible flex flex-col justify-center overflow-hidden rounded-md border border-destructive/20 bg-destructive/10 text-sm',
          )}
          onOpenChange={setGenericDetailsOpen}
        >
          <div className='@container'>
            <div className='flex w-full flex-col transition-colors hover:bg-destructive/15 @xs:flex-row @xs:items-center @xs:gap-2'>
              <CollapsibleTrigger className='flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left outline-none focus-visible:focus-outline'>
                <ChevronRight className='size-4 shrink-0 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90' />
                <div className='min-w-0 flex-1'>
                  <MarkdownViewer
                    className={cn(
                      'inline w-auto! text-sm text-foreground',
                      // Inline-code styles for error messages
                      '[&_code]:text-destructive',
                      '[&_code]:border-destructive/30',
                      '[&_code]:bg-background/80',
                      'line-clamp-none',
                    )}
                  >
                    {parsedError.message || parsedError.title || 'Unable to send the message.'}
                  </MarkdownViewer>
                </div>
              </CollapsibleTrigger>
              <Button
                variant='outline'
                className='mx-2 mb-2 h-auto min-h-7 whitespace-normal hover:border-neutral/50 @xs:mb-0 @xs:ml-0'
                size='sm'
                onClick={() => {
                  handleTryAgain();
                }}
              >
                <RefreshCcw className='size-3.5' />
                Try again
              </Button>
            </div>
          </div>
          <CollapsibleContent className='overflow-x-scroll px-2 pb-2'>
            <CodeViewer text={formattedError} language='json' className='text-xs whitespace-pre-wrap' />
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  /* One decision, taken from the host's own rule rather than a second copy of
   * its code list: a card may promise the turn and say Resume only where
   * `continue` will actually resume the run, and every other card keeps *Try
   * again* and makes no promise. The parsed error carries the same `message`,
   * `code` and `details` the run's terminal record did, which is all the
   * predicate reads. */
  const resumable = isResumableRunFailure(parsedError);

  // An external agent's own stop carries its classification; it outranks the category.
  const agentStop = (externalAgentStopCodes as readonly string[]).includes(parsedError.code ?? '')
    ? externalAgentStopSchema.safeParse(parsedError.details)
    : undefined;
  if (agentStop?.success) {
    return <ChatErrorAgentStop className={cn('min-w-0', className)} stop={agentStop.data} resumable={resumable} />;
  }

  // A coded failure names its own recovery; the category cannot: see
  // `codedErrorCard`.
  const codedCard = codedErrorCard({
    error: parsedError,
    resumable,
    className: cn('min-w-0', className),
    onTryAgain: handleTryAgain,
  });
  if (codedCard !== undefined) {
    return codedCard;
  }

  // Route to specialized error components based on category
  // All cases from ErrorCategory are handled explicitly for exhaustive matching
  const { category } = parsedError;
  switch (category) {
    case errorCategory.auth: {
      return <ChatErrorUnauthorized className={cn('min-w-0', className)} />;
    }

    case errorCategory.network: {
      return <ChatErrorServiceUnavailable className={cn('min-w-0', className)} resumable={resumable} />;
    }

    case errorCategory.credits: {
      return (
        <ChatErrorCredits
          className={cn('min-w-0', className)}
          description={parsedError.message}
          details={parsedError.details}
        />
      );
    }

    case errorCategory.rateLimit: {
      return (
        <ChatErrorRateLimit
          className={cn('min-w-0', className)}
          resumable={resumable}
          title={parsedError.code === 'FUNDED_OPERATION_LIMIT' ? 'Funded operation limit reached' : undefined}
          description={parsedError.message}
          retryAfterSeconds={
            typeof parsedError.details?.['retryAfterSeconds'] === 'number'
              ? parsedError.details['retryAfterSeconds']
              : undefined
          }
        />
      );
    }

    case errorCategory.overloaded: {
      return (
        <ChatErrorServiceUnavailable
          className={cn('min-w-0', className)}
          resumable={resumable}
          title={parsedError.code === 'BILLING_RECOVERY_UNAVAILABLE' ? 'Finalizing earlier work' : undefined}
          description={parsedError.message}
        />
      );
    }

    case errorCategory.toolError: {
      return (
        <ChatErrorTool
          className={cn('min-w-0', className)}
          description={parsedError.message}
          helpUrl={parsedError.helpUrl}
        />
      );
    }

    case errorCategory.server:
    case errorCategory.generic: {
      return renderGenericError();
    }

    default: {
      return renderGenericError();
    }
  }
});
