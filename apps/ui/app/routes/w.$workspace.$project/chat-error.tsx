import { memo, useEffect, useEffectEvent, useState } from 'react';
import type React from 'react';
import { Bot, CircleAlert, MonitorSmartphone, RefreshCcw, WifiOff } from 'lucide-react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { CodeViewer } from '#components/code/code-viewer.js';
import { cn } from '@taucad/ui/utils/cn';
import { chatHistoryTidyFailureMessage, parseErrorForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { ENV } from '#environment.config.js';
import { cardOf } from '@taucad/chat-ui/utils/chat-error-card';
import {
  autoResumableProviderUnavailableCode,
  autoResumableRateLimitCode,
  canAutoResumeModelPending,
  lookUpModelAttempt,
  modelPendingPollMilliseconds,
  modelPendingResumeBy,
  nextProviderUnavailableRetry,
  recordModelPendingAutoResume,
} from '@taucad/ui-core/utils/run-auto-resume';
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

type VisibleChatError = Readonly<{
  error: NormalizedChatError;
  /**
   * The failure's identity from durable data, the same across a rerender, a remount and a projection rebuild: the
   * failed run's attempt, or the refused command's request. Only a live error with neither falls back to the error
   * object's own identity.
   */
  id: string;
}>;

const liveErrorIds = new WeakMap<Error | NormalizedChatError, string>();
let lastLiveErrorId = 0;

/** A live error's identity for as long as the chat holds that error object. */
function liveErrorId(error: Error | NormalizedChatError): string {
  let id = liveErrorIds.get(error);
  if (id === undefined) {
    lastLiveErrorId += 1;
    id = `live:${String(lastLiveErrorId)}`;
    liveErrorIds.set(error, id);
  }
  return id;
}

const refusalId = (refusal: NormalizedChatError): string | undefined =>
  refusal.requestId === undefined ? undefined : `refusal:${refusal.requestId}`;

/** Only the caught-up host log can retire a legacy chat-wide error. */
function selectVisibleChatErrorEntry(
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'error' | 'persistedError'>,
): VisibleChatError | undefined {
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
        // A resumed run that fails again is a new failure: its attempt is part of the identity.
        return { error: parsed, id: `run:${key.runId}:${String(run.attempt)}` };
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
    return { error: refusal, id: `refusal:${refusal.requestId}` };
  }
  if (state.error) {
    const error = parseErrorForPersistence(state.error);
    return { error, id: refusalId(error) ?? liveErrorId(state.error) };
  }
  const persisted = state.persistedError;
  return persisted === undefined ? undefined : { error: persisted, id: refusalId(persisted) ?? liveErrorId(persisted) };
}

/** The chat's visible failure, if any. */
export function selectVisibleChatError(
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'error' | 'persistedError'>,
): NormalizedChatError | undefined {
  return selectVisibleChatErrorEntry(state)?.error;
}

/** The visible failure's durable identity (`run:…`, `refusal:…`), which the phone sheet acknowledges by (I5). */
export function selectVisibleChatErrorId(
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'error' | 'persistedError'>,
): string | undefined {
  return selectVisibleChatErrorEntry(state)?.id;
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

/** The failed run attempt a card may resume on its own. */
type AutoResumeTarget = Readonly<{ runId: string; attempt: number }>;

/**
 * The approved pending-attempt card (D4): named busy status, never an alert. Tau Debug keeps what the host said.
 *
 * @param input - The card class and the raw failure for Tau Debug, when there is one.
 * @returns The card.
 */
function modelPendingCard({ className, raw }: { readonly className: string; readonly raw?: string }): React.ReactNode {
  return (
    <ChatErrorCard
      className={className}
      tone='neutral'
      icon={Bot}
      title='Checking whether the last model call finished'
      role='status'
      aria-label='Checking whether the last model call finished'
      aria-busy='true'
    >
      {raw === undefined ? null : (
        <ChatErrorDetails>
          <CodeViewer text={raw} language='json' className='mt-1 text-xs whitespace-pre-wrap' />
        </ChatErrorDetails>
      )}
    </ChatErrorCard>
  );
}

/**
 * A run abandoned while the gateway still owned its last model attempt (RA-R1 around `MODEL_ATTEMPT_PENDING`).
 *
 * The page asks the attempt route until the gateway settles that attempt, then resumes the run once without a click.
 * Past the run's bound (`modelPendingResumeBy`), or when the attempt settled but this attempt was already resumed, it
 * shows the resumable pause card instead and waits for the person.
 *
 * @param properties - The card class, the failed attempt, the gateway attempt key, Tau Debug's raw text and the
 * pause card to fall back to.
 * @returns The pending card, or the pause card.
 */
function ChatErrorModelPending({
  className,
  target,
  attemptId,
  raw,
  paused,
}: {
  readonly className: string;
  readonly target: AutoResumeTarget;
  readonly attemptId: string;
  readonly raw: string | undefined;
  readonly paused: React.ReactNode;
}): React.ReactNode {
  const { runId, attempt } = target;
  const { continueChat } = useChatActions();
  const [waiting, setWaiting] = useState(() => canAutoResumeModelPending(runId, attempt, Date.now()));
  // Read at the moment the attempt settles, so a new `continueChat` neither restarts the polling nor resumes twice.
  const resumeOnce = useEffectEvent(() => {
    if (!canAutoResumeModelPending(runId, attempt, Date.now())) {
      setWaiting(false);
      return;
    }
    recordModelPendingAutoResume(runId, attempt);
    continueChat();
  });

  useEffect(() => {
    if (!waiting) {
      return;
    }
    const controller = new AbortController();
    let nextLookup: ReturnType<typeof globalThis.setTimeout> | undefined;
    const boundTimer = globalThis.setTimeout(
      () => {
        controller.abort();
        setWaiting(false);
      },
      Math.max(modelPendingResumeBy(runId, Date.now()) - Date.now(), 0),
    );
    const poll = async (): Promise<void> => {
      const answer = await lookUpModelAttempt({ apiBaseUrl: ENV.TAU_API_URL, attemptId, signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      if (answer === 'settled') {
        globalThis.clearTimeout(boundTimer);
        resumeOnce();
        return;
      }
      nextLookup = globalThis.setTimeout(() => {
        void poll();
      }, modelPendingPollMilliseconds);
    };
    void poll();
    return () => {
      controller.abort();
      globalThis.clearTimeout(boundTimer);
      globalThis.clearTimeout(nextLookup);
    };
  }, [waiting, runId, attemptId]);

  return waiting ? modelPendingCard({ className, ...(raw === undefined ? {} : { raw }) }) : paused;
}

/**
 * The gateway attempt key a run abandoned around `MODEL_ATTEMPT_PENDING` waits on, read through the one card map.
 *
 * @param error - The parsed failure.
 * @returns The attempt key, or `undefined` for any other failure.
 */
function pendingAttemptOf(error: NormalizedChatError): string | undefined {
  const abandonedCode = error.code === 'RUN_ABANDONED' ? error.details?.['code'] : undefined;
  const attemptId = error.details?.['attemptId'];
  return typeof abandonedCode === 'string' &&
    cardOf(abandonedCode, error.category).category === 'modelPending' &&
    typeof attemptId === 'string'
    ? attemptId
    : undefined;
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
  autoResume,
}: {
  readonly error: NormalizedChatError;
  readonly resumable: boolean;
  /** The current run's failed attempt, which a card that resumes on its own resumes. */
  readonly autoResume: AutoResumeTarget | undefined;
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
    /* A `wait` refusal that ended an admitted run is recorded RUN_ABANDONED with its code kept (RA-R1, XD3/XD4). */
    const abandonedCode = code === 'RUN_ABANDONED' ? error.details?.['code'] : undefined;
    const waitingOnSync =
      typeof abandonedCode === 'string' && cardOf(abandonedCode, error.category).category === 'waitingOnSync';
    const pausedRaw =
      code === 'RUN_ABANDONED' || code === 'NETWORK_ERROR'
        ? `${error.message}${rawDetail === undefined ? '' : `\n\n${rawDetail}`}`
        : rawDetail;
    const paused = (
      <ChatErrorPausedTurn
        className={className}
        title={
          awaitingApproval
            ? 'Tau closed while the agent waited for your approval'
            : waitingOnSync
              ? 'Waiting on sync from another device'
              : code === 'RUN_ABANDONED'
                ? 'Chat paused'
                : code === 'NETWORK_ERROR'
                  ? 'Connection lost'
                  : undefined
        }
        reason={
          awaitingApproval
            ? 'Resume and the agent asks for it again.'
            : waitingOnSync
              ? 'Resume once sync brings what another device wrote.'
              : code === 'RUN_ABANDONED' || code === 'NETWORK_ERROR'
                ? undefined
                : error.message
        }
        resumable={retry === 'resume' && resumable}
        icon={error.category === errorCategory.overloaded ? WifiOff : CircleAlert}
        raw={pausedRaw}
      />
    );
    /* An abandoned run whose model attempt the gateway still owned shows the pending card and resumes once that
     * attempt settles (D4); a run the host will not resume, or one without its attempt key, keeps the pause card. */
    const pendingAttemptId = pendingAttemptOf(error);
    if (pendingAttemptId !== undefined && retry === 'resume' && resumable && autoResume !== undefined) {
      return (
        <ChatErrorModelPending
          key={`${autoResume.runId}:${String(autoResume.attempt)}`}
          className={className}
          target={autoResume}
          attemptId={pendingAttemptId}
          raw={pausedRaw}
          paused={paused}
        />
      );
    }
    /* A provider outage reads `pausedTurn` in the card map, so the category switch below never sees it: the resumable
     * one gets its auto-resume card here while its one automatic resume is unspent, then the paused card with its Tau
     * Debug details (regression review R6). */
    if (
      code === autoResumableProviderUnavailableCode &&
      retry === 'resume' &&
      resumable &&
      autoResume !== undefined &&
      nextProviderUnavailableRetry(autoResume.runId, autoResume.attempt) !== undefined
    ) {
      return (
        <ChatErrorServiceUnavailable
          className={className}
          resumable
          title='Service Temporarily Unavailable'
          description={error.message}
          autoResume={autoResume}
        />
      );
    }
    return paused;
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

  // Another device is running this chat (XD3). Its run cannot be moved or stopped from here (OQ-N21); the composer
  // holds its send until sync brings that run's ending, and the draft that was refused is kept.
  if (category === 'otherDevice') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={MonitorSmartphone}
        title='This chat is running on another device'
        description='Send again here once that run finishes.'
      />
    );
  }

  // Another device's copy of the chat, or the branch it ran on, has not reached this device yet (XD3, XD4). Both are
  // refused `wait`: the same send is admitted once sync brings it, and nothing here can hurry it.
  if (category === 'waitingOnSync') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={MonitorSmartphone}
        title='Waiting on sync from another device'
        description='This chat continues once sync brings what another device wrote. Send again then.'
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
    return modelPendingCard({ className });
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

/** The current run's failed attempt, when the page knows it. */
const autoResumeTarget = (runId: string | undefined, attempt: number | undefined): AutoResumeTarget | undefined =>
  runId !== undefined && attempt !== undefined ? { runId, attempt } : undefined;

/** Only the provider's transient `RATE_LIMITED` resumes on its own; the card still asks `resumable`. */
const rateLimitAutoResume = (
  code: string | undefined,
  runId: string | undefined,
  attempt: number | undefined,
): AutoResumeTarget | undefined => (code === autoResumableRateLimitCode ? autoResumeTarget(runId, attempt) : undefined);

/**
 * The run's failure, a decision the phone sheet never folds away (I5, `chat-interface-mobile.tsx`): the marker renders
 * only while a card does.
 */
export const ChatError = memo(function ({ className }: { readonly className?: string }): React.ReactNode {
  // Derive parsed error inside selector - prefer runtime error, fallback to persisted
  const parsedError = useChatSelector(selectVisibleChatError);
  const decisionId = useChatSelector(selectVisibleChatErrorId);
  if (!parsedError) {
    return null;
  }
  return (
    <div data-decision='run-error' data-decision-id={decisionId} className='shrink-0'>
      <ChatErrorBody parsedError={parsedError} className={className} />
    </div>
  );
});

function ChatErrorBody({
  parsedError,
  className,
}: {
  readonly parsedError: NormalizedChatError;
  readonly className: string | undefined;
}): React.ReactNode {
  /* One decision, the turn host's own: a card may promise the turn and say Resume only where `continue` will be
   * admitted, which reads the caught-up log's current run — never the error text, which can outlive the run it names
   * or describe a refusal that left no run. Every other card keeps *Try again* and makes no promise. */
  const resumable = useChatSelector(
    (state) =>
      state.projection !== undefined &&
      selectCaughtUp(state.projection) &&
      isResumableRun(selectCurrentRun(state.projection)),
  );
  const currentRunId = useChatSelector((state) =>
    state.projection === undefined ? undefined : selectCurrentRun(state.projection)?.runId,
  );
  const currentAttempt = useChatSelector((state) =>
    state.projection === undefined ? undefined : selectCurrentRun(state.projection)?.attempt,
  );
  const { regenerate } = useChatActions();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();

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
    autoResume: autoResumeTarget(currentRunId, currentAttempt),
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
          autoResume={rateLimitAutoResume(parsedError.code, currentRunId, currentAttempt)}
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
          autoResume={
            parsedError.code === autoResumableProviderUnavailableCode
              ? autoResumeTarget(currentRunId, currentAttempt)
              : undefined
          }
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
}
