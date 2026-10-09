import { memo } from 'react';
import type React from 'react';
import { Bot, CircleAlert, RefreshCcw, WifiOff } from 'lucide-react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { CodeViewer } from '#components/code/code-viewer.js';
import { cn } from '@taucad/ui/utils/cn';
import { chatHistoryTidyFailureMessage, parseErrorForPersistence } from '#utils/error.utils.js';
import { cardOf } from '#utils/chat-error-card.js';
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
import { ChatErrorAccountRestricted } from '#routes/w.$workspace.$project/chat-error-account-restricted.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { isResumableRun } from '@taucad/agent-host';
import { externalAgentStopCodes, externalAgentStopSchema } from '@taucad/agent-host/wire';
import { selectCaughtUp, selectCurrentRun, selectRunFailure } from '#machines/chat-projection.logic.js';

const projectedFailureErrors = new WeakMap<Readonly<{ runId: string; text: string }>, NormalizedChatError>();

/** Only the caught-up host log can retire a legacy chat-wide error. */
export function selectVisibleChatError(
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'error' | 'persistedError'>,
): NormalizedChatError | undefined {
  const { projection } = state;
  const caughtUp = projection !== undefined && selectCaughtUp(projection);
  const run = projection === undefined || !caughtUp ? undefined : selectCurrentRun(projection);
  if (
    projection !== undefined &&
    (run?.lifecycle === 'failed' || (run?.lifecycle === 'cancelled' && run.failure?.code === 'USER_STOPPED'))
  ) {
    const failure = selectRunFailure(projection, run.runId);
    if (failure !== undefined) {
      const key = projection.failure;
      if (key !== undefined) {
        let parsed = projectedFailureErrors.get(key);
        if (parsed === undefined) {
          parsed = parseErrorForPersistence(new Error(failure));
          projectedFailureErrors.set(key, parsed);
        }
        return parsed;
      }
    }
  }
  if (caughtUp && state.attachmentStatus === 'attached') {
    // A command refusal carries its command identity. A chat-wide legacy error
    // does not. A later healthy run also retires a prior refused Start, even
    // when a different page admitted that run and this page never cleared the
    // old chat record. A refused Resume still belongs to the same paused run;
    // the persisted command records that run identity, not just its command ID.
    const refusal = state.persistedError;
    if (refusal?.requestId === undefined) {
      return undefined;
    }
    const refusedRunId = refusal.details?.['runId'];
    const refusedCommandType = refusal.details?.['commandType'];
    if (
      run !== undefined &&
      (run.lifecycle !== 'paused' || refusedRunId !== run.runId || refusedCommandType !== 'resume')
    ) {
      return undefined;
    }
    return refusal;
  }
  return state.error ? parseErrorForPersistence(state.error) : state.persistedError;
}

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
 * The refusal as the card received it, for Tau Debug: the transport's raw text
 * when it kept one, otherwise the coded fields themselves. A card whose copy is
 * the page's own still discloses what the gateway said, but only here.
 *
 * @param error - The parsed failure.
 * @param rawDetail - Its formatted raw text, when it carried one.
 * @returns Pretty-printed JSON.
 */
function codedRefusalRaw(error: NormalizedChatError, rawDetail: string | undefined): string {
  return (
    rawDetail ??
    JSON.stringify(
      {
        code: error.code,
        message: error.message,
        ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      null,
      2,
    )
  );
}

/**
 * The card a coded failure names for itself, or `undefined` when its category
 * decides instead.
 *
 * Kept out of the component because a status says nothing about whether the
 * turn survived; the one typed card map and host retry class decide that.
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
  onRegenerate,
  onNewChat,
  canOpenNewChat,
}: {
  readonly error: NormalizedChatError;
  readonly resumable: boolean;
  readonly className: string;
  readonly onTryAgain: () => void;
  readonly onRegenerate: () => void;
  readonly onNewChat: () => void;
  readonly canOpenNewChat: boolean;
}): React.ReactNode | undefined {
  const { code } = error;
  if (code === 'USER_STOPPED') {
    return <ChatErrorPausedTurn className={className} title='You stopped this turn' resumable={resumable} />;
  }
  const { category, retry } = cardOf(code, error.category);
  const rawDetail = error.raw ? tryFormatJson(error.raw) : undefined;
  const raw = rawDetail === undefined ? {} : { raw: rawDetail };

  if (category === 'providerAccount') {
    return <ChatErrorProviderAccount className={className} description={error.message} details={error.details} />;
  }

  if (category === 'historyTidy') {
    return (
      <ChatErrorPausedTurn
        className={className}
        reason={chatHistoryTidyFailureMessage}
        resumable={retry === 'resume' && resumable}
        guidance='Resume to continue without losing your work.'
        canTryAgain
        {...raw}
      />
    );
  }

  /* The host went silent: a browser worker that died and could not be replaced (was `WORKER_CRASHED`, T3), or a
   * daemon past the channel's liveness bound. The command's effect is unknown — the start may never have been
   * admitted — so the card claims no run and promises nothing. */
  if (category === 'peerUnresponsive') {
    return (
      <ChatErrorPausedTurn
        className={className}
        title='Tau stopped responding'
        reason='Tau cannot tell whether this turn started.'
        resumable={false}
        {...raw}
      />
    );
  }

  // The host's hello names a wire this page cannot speak; only updating Tau there helps.
  if (category === 'updateHost') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title='Update Tau on this host'
        description='This host runs a version of Tau this page cannot talk to. Update Tau there, then try again.'
        actions={
          <Button variant='outline' size='xs' onClick={onTryAgain}>
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        }
      />
    );
  }

  if (category === 'pausedTurn') {
    // The orphan rule records why the driver went (`orphanRows`): an agent left waiting for approval asks again.
    const awaitingApproval = code === 'RUN_ABANDONED' && error.details?.['cause'] === 'awaiting-approval';
    return (
      <ChatErrorPausedTurn
        className={className}
        title={
          awaitingApproval
            ? 'Tau closed while the agent waited for your approval'
            : code === 'RUN_ABANDONED'
              ? 'Chat paused'
              : code === 'NETWORK_ERROR'
                ? 'Connection lost'
                : undefined
        }
        reason={
          awaitingApproval
            ? 'Resume and the agent asks for it again.'
            : code === 'RUN_ABANDONED' || code === 'NETWORK_ERROR'
              ? undefined
              : error.message
        }
        resumable={retry === 'resume' && resumable}
        icon={error.category === errorCategory.overloaded ? WifiOff : CircleAlert}
        raw={
          code === 'RUN_ABANDONED' || code === 'NETWORK_ERROR'
            ? `${error.message}${rawDetail === undefined ? '' : `\n\n${rawDetail}`}`
            : rawDetail
        }
      />
    );
  }

  /* Tau's operators paused this model's route (W6): another model still answers, so the card offers the switch and a
   * Try again that sends on whichever model is chosen. Resuming would re-send to the paused route, so the card neither
   * offers it nor promises the turn, and the gateway's sentence stays in Tau Debug (IS3). */
  if (code === 'MODEL_ROUTE_PAUSED') {
    return (
      <ChatErrorPausedTurn
        className={className}
        title='This model is paused'
        reason="Tau's operators have paused this model. Switch to another model to continue."
        resumable={false}
        canSwitchModel
        raw={codedRefusalRaw(error, rawDetail)}
      />
    );
  }

  // Spending on the account is held (W11a): the account's, not the route's, so neither Resume nor another model helps.
  if (category === 'accountRestricted') {
    return <ChatErrorAccountRestricted className={className} raw={codedRefusalRaw(error, rawDetail)} />;
  }

  // A refusal of the request itself resumes once the model or its settings
  // change; re-issuing it unchanged meets the same refusal, which is honest and
  // costs nothing.
  if (category === 'switchModel') {
    return (
      <ChatErrorPausedTurn
        className={className}
        title='The model refused this request'
        reason={error.message}
        resumable={retry === 'resume' && resumable}
        guidance='Change the model or its settings, then resume.'
        canSwitchModel
        {...raw}
      />
    );
  }

  if (category === 'chatTooLong') {
    return <ChatErrorTooLong className={className} resumable={retry === 'resume' && resumable} />;
  }

  /* Not a failure: the host was asked to continue a run it no longer holds —
   * it was already settled, or it ended in a way a resume cannot pick up. The
   * turn is whole and nothing was spent, so the card says so and offers the
   * one thing that does work, which is running the turn again. */
  if (category === 'nothingToResume') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={Bot}
        title='Nothing left to continue'
        description={error.message}
        actions={
          <Button variant='outline' size='xs' onClick={onRegenerate}>
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        }
      />
    );
  }

  // Another tab holds this chat's log. Taking it back is a leadership protocol,
  // not an error action (ruling Q6), and reloading already follows that tab.
  if (category === 'otherTab') {
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
  if (category === 'turnNotStarted') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
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

  if (category === 'otherBuild') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={Bot}
        title='Another version of Tau is running this chat'
        description='It continues here when that run finishes; if this window is the older version, reload it.'
      />
    );
  }

  if (category === 'modelPending') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={Bot}
        title='Checking whether the last model call finished'
        role='status'
        aria-label='Checking whether the last model call finished'
        aria-busy='true'
      />
    );
  }

  if (category === 'update') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title='This chat was continued in a newer version of Tau'
        actions={
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              globalThis.location.reload();
            }}
          >
            Reload
          </Button>
        }
      />
    );
  }

  if (category === 'historyInvalid') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title="Tau can't read this chat's history"
        description='Start a new chat to keep working.'
        actions={
          <Button variant='outline' size='xs' disabled={!canOpenNewChat} onClick={onNewChat}>
            New chat
          </Button>
        }
      />
    );
  }

  if (category === 'externalRestart') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title="Tau couldn't reopen the agent's session"
        description="The agent's earlier session is gone, so this turn can't continue where it stopped. Try again to run it from the start."
        actions={
          <Button variant='outline' size='xs' onClick={onRegenerate}>
            Try again
          </Button>
        }
      />
    );
  }

  return undefined;
}

export const ChatError = memo(function ({ className }: { readonly className?: string }): React.ReactNode {
  // Derive parsed error inside selector - prefer runtime error, fallback to persisted
  const parsedError = useChatSelector(selectVisibleChatError);
  /* One decision, the turn host's own: a card may promise the turn and say Resume only where `continue` will be
   * admitted, which reads the caught-up log's current run — never the error text, which can outlive the run it names
   * or describe a refusal that left no run. Every other card keeps *Try again* and makes no promise. */
  const resumable = useChatSelector(
    (state) =>
      state.projection !== undefined &&
      selectCaughtUp(state.projection) &&
      isResumableRun(selectCurrentRun(state.projection)),
  );
  const { regenerate } = useChatActions();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();

  if (!parsedError) {
    return null;
  }

  // Try again is an explicit replay. Specialized components own auth,
  // credits, rate-limit, and tool-error actions. Credits remain the
  // account-state "Resume" exception.
  const handleTryAgain = regenerate;

  // Render the generic/server error view with collapsible details
  const renderGenericError = (): React.ReactNode => {
    const formattedError = parsedError.raw ? tryFormatJson(parsedError.raw) : parsedError.message;

    return (
      <ChatErrorCard
        className={cn('min-w-0', className)}
        tone='warning'
        icon={CircleAlert}
        title={parsedError.message || parsedError.title || 'Unable to send the message.'}
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
      >
        <ChatErrorDetails>
          <CodeViewer text={formattedError} language='json' className='mt-1 text-xs whitespace-pre-wrap' />
        </ChatErrorDetails>
      </ChatErrorCard>
    );
  };

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
    onRegenerate: regenerate,
    onNewChat: () => {
      void openNewChat();
    },
    canOpenNewChat,
  });
  if (codedCard !== undefined) {
    return codedCard;
  }

  // Route to specialized error components based on category
  // All cases from ErrorCategory are handled explicitly for exhaustive matching
  const { category } = cardOf(parsedError.code, parsedError.category);
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
          resumable={resumable}
          description={parsedError.message}
          details={parsedError.details}
        />
      );
    }

    case errorCategory.rateLimit:
    case 'fundedLimit': {
      return (
        <ChatErrorRateLimit
          className={cn('min-w-0', className)}
          resumable={resumable}
          title={category === 'fundedLimit' ? 'Funded operation limit reached' : undefined}
          description={parsedError.message}
          retryAfterSeconds={
            typeof parsedError.details?.['retryAfterSeconds'] === 'number'
              ? parsedError.details['retryAfterSeconds']
              : undefined
          }
        />
      );
    }

    case errorCategory.overloaded:
    case 'billingRecovery': {
      return (
        <ChatErrorServiceUnavailable
          className={cn('min-w-0', className)}
          resumable={resumable}
          title={category === 'billingRecovery' ? 'Finalizing earlier work' : undefined}
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
