import { memo, useCallback, useSyncExternalStore } from 'react';
import type React from 'react';
import { Bot, CircleAlert, MonitorSmartphone, RefreshCcw, WifiOff } from 'lucide-react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { useChatActions, useChatContext, useChatSelector } from '#hooks/use-chat.js';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { CodeViewer } from '@taucad/editor-ui/components/code/code-viewer';
import { cn } from '@taucad/ui/utils/cn';
import { isCodeLoadFailure } from '@taucad/ui-core/lib/code-loading';
import { admissionCauseKey, chatHistoryTidyFailureMessage } from '@taucad/chat-ui/utils/error.utils';
import { cardOf, pageHeadlineOf, waitLineOf } from '@taucad/chat-ui/utils/chat-error-card';
import {
  autoResumableProviderUnavailableCode,
  nextProviderUnavailableRetry,
} from '@taucad/chat-ui/utils/run-auto-resume';
import { selectVisibleChatErrorEntry, selectVisibleFailureResumable } from '#utils/run-auto-resume-plan.js';
import type { AutoResumePlan, AutoResumeTarget } from '#utils/run-auto-resume-plan.js';
import { useChatAutoResume, useChatComposer } from '#hooks/active-chat-provider.js';
import { useOptionalChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { ChatResidualLine, useComputerName } from '#routes/w.$workspace.$project/chat-residual.js';
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
import { externalAgentStopCodes, externalAgentStopSchema } from '@taucad/agent-host/wire';
import { selectCurrentRun } from '#machines/chat-projection.logic.js';

type VisibleChatErrorEntry = NonNullable<ReturnType<typeof selectVisibleChatErrorEntry>>;

const isQuiet = (entry: VisibleChatErrorEntry): boolean =>
  cardOf(entry.error.code, entry.error.category).category === 'quiet';

/**
 * The visible failure the chat shows a card for. A `quiet` code shows none (HA5 code table): a transport or handoff
 * code is re-sent under the "Reconnecting…" cue (HA-I8), and a send a Stop superseded ends without a word. A quiet
 * refusal of a gesture never hides what it outranks: a Resume answered `HOST_CLOSED` leaves the run's own card.
 */
const shownEntry = (
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'persistedError'>,
): VisibleChatErrorEntry | undefined => {
  const entry = selectVisibleChatErrorEntry(state);
  if (entry === undefined || !isQuiet(entry)) {
    return entry;
  }
  const beneath =
    state.persistedError === undefined
      ? undefined
      : selectVisibleChatErrorEntry({ ...state, persistedError: undefined });
  return beneath === undefined || isQuiet(beneath) ? undefined : beneath;
};

/** The chat's visible failure, if any. */
export function selectVisibleChatError(
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'persistedError'>,
): NormalizedChatError | undefined {
  return shownEntry(state)?.error;
}

/** The visible failure's durable identity (`run:…`, `refusal:…`), which the phone sheet acknowledges by (I5). */
export function selectVisibleChatErrorId(
  state: Pick<CombinedChatState, 'projection' | 'attachmentStatus' | 'persistedError'>,
): string | undefined {
  return shownEntry(state)?.id;
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
 * The name of the computer the chat's refusals came from (else the one it is placed on); mounted only by a card that
 * names one, so the other cards list no computers.
 */
function ComputerName(): React.JSX.Element {
  const attachedHostId = useChatSelector((state) => state.attachedHostId);
  const { execution } = useChatComposer().execution;
  return <>{useComputerName(attachedHostId ?? (execution.kind === 'tau' ? execution.hostId : undefined))}</>;
}

/** R9 on Tau Desktop: a chat placed on the page's own Tau, which the desktop app never runs. */
function ChatErrorChooseThisComputer({ className }: { readonly className: string }): React.JSX.Element {
  const { execution, setActiveExecution } = useChatComposer().execution;
  return (
    <ChatResidualLine
      className={className}
      residual={{
        kind: 'R9',
        cause: 'placement',
        onChooseThisComputer: () => {
          if (execution.kind === 'tau') {
            setActiveExecution({ ...execution, hostId: 'desktop' });
          }
        },
      }}
    />
  );
}

/**
 * R6 for a refused command: the computer is no longer paired. A chat this device reads from its own files says that
 * reading still works.
 */
const noSubscription = (): void => undefined;

/** Whether the chat's R1 line shows: a remote computer it cannot read, or a message pinned to one. */
function useR1Shows(): boolean {
  const { activeChatId: chatId } = useChatContext();
  const store = useOptionalChatSessionStore();
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribeProjection(chatId, listener) ?? noSubscription,
    [chatId, store],
  );
  const read = useCallback(
    () =>
      store !== undefined &&
      store.getRemoteResidual(chatId) === undefined &&
      (store.getUnreachableComputer(chatId) !== undefined || store.pinnedElsewhereOf(chatId) !== undefined),
    [chatId, store],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The one restart that loses nothing: admission refused before a run existed. A turn refused because its computer
 * is out of reach steps aside while R1 says so, with Remove and Send here instead, so one card shows.
 */
function ChatErrorTurnNotStarted({
  className,
  error,
  onTryAgain,
}: {
  readonly className: string | undefined;
  readonly error: NormalizedChatError;
  readonly onTryAgain: () => void;
}): React.JSX.Element | undefined {
  const r1Shows = useR1Shows();
  if (r1Shows && error.details?.[admissionCauseKey] === 'CHAT_PLACEMENT_UNAVAILABLE') {
    return undefined;
  }
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

function ChatErrorPair({
  className,
  computer,
}: {
  readonly className: string;
  readonly computer: React.ReactNode;
}): React.JSX.Element {
  const { activeChatId } = useChatContext();
  const readable = useOptionalChatSessionStore()?.readsLocally(activeChatId) === true;
  const { open: openSettings } = useSettingsDialog();
  return (
    <ChatResidualLine
      className={className}
      residual={{
        kind: 'R6',
        computer,
        readable,
        onPair: () => {
          openSettings('compute');
        },
      }}
    />
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
  autoResume,
  waiting,
  entryId,
}: {
  readonly error: NormalizedChatError;
  /** The failure's identity: `run:…` for a run that ended on it, else a refused command (`refusal:…`). */
  readonly entryId: string | undefined;
  readonly resumable: boolean;
  /** The current run's failed attempt. */
  readonly autoResume: AutoResumeTarget | undefined;
  /** The automatic resume the chat's machine is waiting out for that attempt (audit R5). */
  readonly waiting: AutoResumePlan | undefined;
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
  /* FP10 (R9): the agent host's own code failed to load and the page has already replaced its worker as often as it
   * will. Sending again would meet the same failure in this page, so the card offers Reload, never Try again. */
  if (code === 'WORKER_LOAD_FAILED' || category === 'reload' || isCodeLoadFailure(new Error(error.message))) {
    return <ChatResidualLine className={className} residual={{ kind: 'R9', cause: 'load' }} />;
  }
  /* R9: a desktop chat placed on the page's own Tau, which the desktop app never runs; this computer runs it. */
  if (code === 'BROWSER_HOST_UNAVAILABLE') {
    return <ChatErrorChooseThisComputer className={className} />;
  }
  if (category === 'browserStorage') {
    return <ChatResidualLine className={className} residual={{ kind: 'R3' }} />;
  }
  if (category === 'pair') {
    return <ChatErrorPair className={className} computer={<ComputerName />} />;
  }
  if (category === 'waitLine') {
    /* A `wait` code with a line of its own: the send stays queued and goes by itself, so nothing is offered. */
    return <ChatErrorCard className={className} role='status' tone='neutral' icon={Bot} title={waitLineOf(code)} />;
  }
  /* AR3-11: a host defect. A run that ended on one is that turn's failure; anything else was a command refused. */
  if (category === 'hostFault') {
    return entryId?.startsWith('run:') === true ? (
      <ChatErrorPausedTurn
        className={className}
        title='Something went wrong running this turn.'
        resumable={resumable}
        {...raw}
      />
    ) : (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title='Tau couldn’t do that just now.'
        description='Try again.'
        actions={
          <Button variant='outline' size='xs' onClick={onTryAgain}>
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        }
      />
    );
  }
  if (category === 'storageUnwritable') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title='Tau couldn’t save to this chat’s files.'
        description='Reload to try again. If it keeps happening, free up space on this device.'
        actions={
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              globalThis.location.reload();
            }}
          >
            <RefreshCcw className='size-3.5' />
            Reload
          </Button>
        }
      />
    );
  }

  /* I1: the host could not learn whether this server funds model calls, so this attempt made none. The host's own
   * instruction wins when it sends one (a recorded mode this build cannot read, a host that cannot fund the run). */
  if (category === 'deploymentUnknown') {
    const hostInstruction = error.message.trim();
    return (
      <ChatErrorServiceUnavailable
        className={className}
        resumable={resumable}
        title="Couldn't confirm how this server bills model calls"
        description={
          hostInstruction === ''
            ? 'The app could not confirm how this Tau server bills model calls, so this attempt made none. Check your connection, then resume.'
            : hostInstruction
        }
      />
    );
  }

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

  /* The computer speaks another wire, or could not read this page's frames: only updating Tau there helps. The send
   * ends, and the composer keeps its draft. */
  if (category === 'updateHost') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title={
          <>
            Update Tau on{' '}
            <strong>
              <ComputerName />
            </strong>{' '}
            to keep working with it.
          </>
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
              ? 'Waiting for changes from your other device'
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
              ? 'Resume when the changes from your other device arrive.'
              : code === 'RUN_ABANDONED' || code === 'NETWORK_ERROR'
                ? undefined
                : error.message
        }
        resumable={retry === 'resume' && resumable}
        icon={error.category === errorCategory.overloaded ? WifiOff : CircleAlert}
        raw={pausedRaw}
      />
    );
    /* An abandoned run whose model attempt the gateway still owned shows the pending card while the chat's machine
     * asks the attempt route, and resumes once that attempt settles (D4, `#utils/run-auto-resume-plan`). Past the
     * run's bound, or for a run the host will not resume, it keeps the pause card. */
    if (waiting?.kind === 'modelPending') {
      return modelPendingCard({ className, ...(pausedRaw === undefined ? {} : { raw: pausedRaw }) });
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
          {...(waiting?.kind === 'providerUnavailable' ? { countdown: waiting } : {})}
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
        title={pageHeadlineOf(code)}
        reason="Tau's operators have paused this model. Switch to another model to continue."
        resumable={false}
        canSwitchModel
        raw={codedRefusalRaw(error, rawDetail)}
      />
    );
  }

  /* The provider refused reasoning replayed from earlier in the chat. The same history meets the same refusal on this
   * model, so the card offers the switch, as for a paused route; the provider's sentence stays in Tau Debug. */
  if (code === 'REASONING_REPLAY_REJECTED') {
    return (
      <ChatErrorPausedTurn
        className={className}
        title={pageHeadlineOf(code)}
        reason='The model provider refused reasoning from earlier in this chat. Switch to another model to continue.'
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
  // costs nothing. INVALID_REQUEST is Tau's own host or gateway contract refusing
  // the request before any model saw it, so the card does not blame the model.
  if (category === 'switchModel') {
    return (
      <ChatErrorPausedTurn
        className={className}
        title={code === 'INVALID_REQUEST' ? 'Tau could not send this request' : 'The model refused this request'}
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

  // Another device is running this chat (XD3). Its run cannot be moved or stopped from here (OQ-N21); the composer
  // holds its send until sync brings that run's ending, and the draft that was refused is kept.
  if (category === 'otherDevice') {
    return (
      <ChatErrorCard
        className={className}
        tone='neutral'
        icon={MonitorSmartphone}
        title='This chat is running on your other device'
        description='Send again here once it finishes.'
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
        title='Waiting for changes from your other device'
        description='This chat continues when the changes from your other device arrive. Send again then.'
      />
    );
  }

  // The one restart that loses nothing: admission refused before a run existed.
  if (category === 'turnNotStarted') {
    return <ChatErrorTurnNotStarted className={className} error={error} onTryAgain={onTryAgain} />;
  }

  if (category === 'modelPending') {
    return modelPendingCard({ className });
  }

  if (category === 'update') {
    return <ChatResidualLine className={className} residual={{ kind: 'R4' }} />;
  }

  if (category === 'historyInvalid') {
    return (
      <ChatErrorCard
        className={className}
        tone='warning'
        icon={CircleAlert}
        title='This chat’s saved history can’t be read.'
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

/** The machine waits out the visible failure's own resume; a wait for another attempt is not this card's. */
const waitingFor = (
  offered: AutoResumePlan | undefined,
  runId: string | undefined,
  attempt: number | undefined,
): AutoResumePlan | undefined =>
  offered !== undefined && offered.runId === runId && offered.attempt === attempt ? offered : undefined;

/** The countdown a card shows beside Resume: only the chat's own wait of that kind, for the current attempt. */
const countdownOf = (
  waiting: AutoResumePlan | undefined,
  kind: 'rateLimit' | 'providerUnavailable',
): { countdown?: Readonly<{ resumeAt: number }> } => (waiting?.kind === kind ? { countdown: waiting } : {});

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
      <ChatErrorBody parsedError={parsedError} entryId={decisionId} className={className} />
    </div>
  );
});

function ChatErrorBody({
  parsedError,
  entryId,
  className,
}: {
  readonly parsedError: NormalizedChatError;
  readonly entryId: string | undefined;
  readonly className: string | undefined;
}): React.ReactNode {
  /* One decision, the turn host's own: a card may promise the turn and say Resume only where `continue` will be
   * admitted, which reads the caught-up log's current run — never the error text, which can outlive the run it names
   * or describe a refusal that left no run. A refused send, edit or retry is not that run's failure, so its card
   * makes no promise of it either. Every other card keeps *Try again* and makes no promise. */
  const resumable = useChatSelector(selectVisibleFailureResumable);
  const currentRunId = useChatSelector((state) =>
    state.projection === undefined ? undefined : selectCurrentRun(state.projection)?.runId,
  );
  const currentAttempt = useChatSelector((state) =>
    state.projection === undefined ? undefined : selectCurrentRun(state.projection)?.attempt,
  );
  const { regenerate } = useChatActions();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();
  const waiting = waitingFor(useChatAutoResume(), currentRunId, currentAttempt);

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
    entryId,
    resumable,
    className: cn('min-w-0', className),
    onTryAgain: handleTryAgain,
    onRegenerate: regenerate,
    onNewChat: () => {
      void openNewChat();
    },
    canOpenNewChat,
    autoResume: autoResumeTarget(currentRunId, currentAttempt),
    waiting,
  });
  if (codedCard !== undefined) {
    return codedCard;
  }

  // Route to specialized error components based on category
  // All cases from ErrorCategory are handled explicitly for exhaustive matching
  const { category } = cardOf(parsedError.code, parsedError.category);
  switch (category) {
    case errorCategory.auth: {
      return <ChatErrorUnauthorized className={cn('min-w-0', className)} resumable={resumable} />;
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
          {...countdownOf(waiting, 'rateLimit')}
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
          {...countdownOf(waiting, 'providerUnavailable')}
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
