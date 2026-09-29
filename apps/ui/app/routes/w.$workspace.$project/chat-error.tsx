import { memo } from 'react';
import type React from 'react';
import { Bot, CircleAlert, Play, RefreshCcw, WifiOff } from 'lucide-react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { useChatActions, useChatContext, useChatRetrySnapshot, useChatSelector } from '#hooks/use-chat.js';
import {
  resumableBrowserAgentHostRunId,
  stoppedBrowserAgentHostRunId,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { CodeViewer } from '#components/code/code-viewer.js';
import { cn } from '@taucad/ui/utils/cn';
import { chatHistoryTidyFailureMessage, chatTurnNotStartedCode, parseErrorForPersistence } from '#utils/error.utils.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { ChatErrorDetails } from '#routes/w.$workspace.$project/chat-error-details.js';
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
    const interruptionTitle =
      code === 'RUN_ABANDONED' ? 'Chat paused' : code === 'NETWORK_ERROR' ? 'Connection lost' : undefined;
    return (
      <ChatErrorPausedTurn
        className={className}
        title={interruptionTitle}
        reason={interruptionTitle === undefined ? error.message : undefined}
        resumable={resumable}
        icon={code === 'PROVIDER_UNAVAILABLE' || code === 'UPSTREAM_REJECTED' ? WifiOff : CircleAlert}
        raw={
          interruptionTitle === undefined
            ? rawDetail
            : `${error.message}${rawDetail === undefined ? '' : `\n\n${rawDetail}`}`
        }
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
          <Button variant='outline' size='xs' onClick={onTryAgain}>
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
          <Button variant='outline' size='xs' onClick={onTryAgain}>
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
  const { activeChatId } = useChatContext();
  const resumableRunId = useChatSelector(() => resumableBrowserAgentHostRunId(activeChatId));
  const stoppedRunId = useChatSelector(() => stoppedBrowserAgentHostRunId(activeChatId));
  const { resume } = useChatComposer();
  const { retryAttempt } = useChatRetrySnapshot();
  // Derive parsed error inside selector - prefer runtime error, fallback to persisted
  const parsedError = useChatSelector((state): NormalizedChatError | undefined => {
    if (state.error) {
      return parseErrorForPersistence(state.error);
    }

    return state.persistedError;
  });
  const { regenerate } = useChatActions();

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
    return stoppedRunId !== undefined && resume !== undefined ? (
      <ChatErrorCard
        className={cn('min-w-0', className)}
        tone='neutral'
        title='Stopped'
        description='Continue this turn when you are ready.'
        actions={
          <Button variant='outline' size='xs' onClick={resume}>
            <Play className='size-3.5' />
            Resume
          </Button>
        }
      />
    ) : null;
  }

  // Generic failures use the same compact recovery surface as coded failures.
  const renderGenericError = (): React.ReactNode => {
    const formattedError = parsedError.raw ? tryFormatJson(parsedError.raw) : parsedError.message;

    return (
      <ChatErrorCard
        className={cn('min-w-0', className)}
        tone='warning'
        icon={CircleAlert}
        title={parsedError.message || parsedError.title || 'Unable to send the message.'}
        actions={
          <Button variant='outline' size='xs' onClick={regenerate}>
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        }
      >
        <ChatErrorDetails>
          <CodeViewer text={formattedError} language='json' className='mt-1 text-xs whitespace-pre-wrap' />
        </ChatErrorDetails>
      </ChatErrorCard>
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
    onTryAgain: regenerate,
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
          resumable={resumableRunId !== undefined}
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
