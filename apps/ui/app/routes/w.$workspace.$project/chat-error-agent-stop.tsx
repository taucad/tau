import { memo, useEffect, useState } from 'react';
import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronRight,
  CircleAlert,
  Clock,
  Gauge,
  MessageSquarePlus,
  Play,
  RefreshCcw,
  Repeat,
  Timer,
} from 'lucide-react';
import type { ExternalAgentStop } from '@taucad/agent-host';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { useChatActions } from '#hooks/use-chat.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { ChatExecutionSelector, useChatAgentSelection } from '#components/chat/chat-execution-selector.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

type StopNotice = {
  readonly icon: LucideIcon;
  /** `status` for a stop the person's account explains, `alert` for an unexpected one. */
  readonly live: 'status' | 'alert';
  readonly heading: string;
  readonly primary?: 'retry' | 'resume' | 'new-chat';
  /** Whether another agent is the useful way forward. */
  readonly canSwitchAgent: boolean;
  /** Whether the turn survives the stop, so the card promises it and resumes. */
  readonly keepsTurn?: boolean;
  /**
   * Whether another agent, not Resume, is what resolves the stop now. A quota
   * only time clears puts the action that works first (DESIGN).
   */
  readonly switchAgentFirst?: boolean;
};

/** Tau's word for the window an agent reported exhausted. */
const usageWindowWord = (agentWindow: string | undefined): string =>
  agentWindow === 'five_hour' ? '5-hour' : agentWindow?.startsWith('seven_day') === true ? 'weekly' : 'usage';

/** The span over which a weekday still names one day without a date. */
const weekdayHorizonMs = 6 * 24 * 60 * 60 * 1000;

/**
 * A reset time in the reader's own locale and zone.
 *
 * The agent reports an instant, not a wall clock: Claude Code's `resetsAt` is
 * epoch seconds and Codex's prose carries the daemon's zone, so the only clock
 * that can be right here is the reader's. A reset on another day carries its
 * weekday, or its date once a weekday would be ambiguous.
 *
 * @param resetsAtMs - When the limit refreshes, in epoch milliseconds.
 * @param nowMs - The instant the card is reading, in epoch milliseconds.
 * @returns The formatted time, e.g. `3:00 pm` or `Sat 3:00 pm`.
 */
const formatResetTime = (resetsAtMs: number, nowMs: number): string => {
  const reset = new Date(resetsAtMs);
  const time = { hour: 'numeric', minute: '2-digit' } as const;
  const options: Intl.DateTimeFormatOptions =
    reset.toDateString() === new Date(nowMs).toDateString()
      ? time
      : resetsAtMs - nowMs < weekdayHorizonMs
        ? { weekday: 'short', ...time }
        : { month: 'short', day: 'numeric', ...time };
  // Only the day period is lowered; a locale's own weekday or month casing is
  // its business.
  return new Intl.DateTimeFormat(undefined, options)
    .formatToParts(reset)
    .map((part) => (part.type === 'dayPeriod' ? part.value.toLocaleLowerCase() : part.value))
    .join('');
};

/**
 * What the person sees for one external-agent stop.
 *
 * The agent's own `actions` decide the recovery: an empty list means retrying
 * cannot help (a usage quota), `retry` means it can (a rate limit or a busy
 * service), `new_session` means only a fresh conversation will (a context or
 * budget limit). Mirrors the reviewed canvas table
 * (`docs/research/artifacts/external-agent-limit-handling-blueprint/canvas`).
 *
 * A limit stops the turn without spoiling it — the vendor session is
 * remembered, so **Resume** continues it rather than replaying it on the
 * person's own quota. A failure the agent could not classify makes no such
 * promise and keeps *Try again*.
 *
 * @param stop - The stop the run recorded.
 * @returns The notice copy and actions.
 */
export const describeAgentStop = (stop: ExternalAgentStop): StopNotice => {
  const name = externalAgentDisplayName(stop.agentId);
  const { category, actions } = stop.failure;
  const canRetry = actions.includes('retry');
  const needsNewChat = actions.includes('new_session');
  if (category === 'limit' && actions.length === 0) {
    return {
      icon: Gauge,
      live: 'status',
      heading: `${name} usage limit reached`,
      primary: 'resume',
      canSwitchAgent: true,
      keepsTurn: true,
      switchAgentFirst: true,
    };
  }
  if (category === 'limit' && canRetry) {
    return {
      icon: Timer,
      live: 'status',
      heading: `${name} is rate limited`,
      primary: 'resume',
      canSwitchAgent: true,
      keepsTurn: true,
    };
  }
  if (category === 'limit') {
    return {
      icon: Gauge,
      live: 'status',
      heading: `${name} reached a session limit`,
      ...(needsNewChat ? { primary: 'new-chat' } : {}),
      canSwitchAgent: !needsNewChat,
    };
  }
  if (stop.diagnostics === undefined && !needsNewChat) {
    return {
      icon: Clock,
      live: 'status',
      heading: `${name} is unavailable right now`,
      ...(canRetry ? { primary: 'retry' } : {}),
      canSwitchAgent: true,
    };
  }
  return {
    icon: CircleAlert,
    live: 'alert',
    heading: `${name} stopped unexpectedly`,
    ...(canRetry ? { primary: 'retry' } : needsNewChat ? { primary: 'new-chat' } : {}),
    canSwitchAgent: false,
  };
};

const urlPattern = /(https?:\/\/[^\s]+?)(?=[.,;:!?)]*(?:\s|$))/u;

/** The provider's sentence with its links made clickable; everything else stays text. */
function ProviderSentence({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <>
      {/* A capturing split puts every link at an odd index. */}
      {text.split(urlPattern).map((part, index) =>
        index % 2 === 1 ? (
          <a
            // oxlint-disable-next-line react/no-array-index-key -- the split of one immutable sentence
            key={index}
            href={part}
            target='_blank'
            rel='noreferrer noopener'
            className='[overflow-wrap:anywhere] text-foreground underline underline-offset-2'
          >
            {part.replace(/^https?:\/\//u, '')}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * An external agent's turn that stopped short: a usage, rate or session limit
 * on the person's own account, or a failure the agent reported.
 *
 * A limit is an ordinary account state, so it reads as a neutral notice with
 * the provider's own sentence, not a destructive error. Adapter logs appear
 * only on request.
 */
export const ChatErrorAgentStop = memo(function ({
  className,
  stop,
}: {
  readonly className?: string;
  readonly stop: ExternalAgentStop;
}): React.JSX.Element {
  const { continueChat } = useChatActions();
  const {
    execution: { execution },
  } = useChatComposer();
  const { isOffered: isAgentSelectorOffered } = useChatAgentSelection();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const resetsAtMs = stop.resetsAt === undefined ? undefined : stop.resetsAt * 1000;
  /* Ruling Q8: the card owns this clock. One timer, armed for the reset the
   * agent reported, is all that stands between a held Resume and a live one —
   * no host timer and no new run state. */
  const [readAt, setReadAt] = useState(() => Date.now());
  useEffect(() => {
    if (resetsAtMs === undefined || resetsAtMs <= Date.now()) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      setReadAt(Date.now());
    }, resetsAtMs - Date.now());
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [resetsAtMs]);

  const notice = describeAgentStop(stop);
  const showSwitchAgent = notice.canSwitchAgent && isAgentSelectorOffered;
  const heldUntil = resetsAtMs !== undefined && resetsAtMs > readAt ? formatResetTime(resetsAtMs, readAt) : undefined;

  const primaryAction =
    notice.primary === 'retry' ? (
      <Button
        variant='outline'
        size='sm'
        onClick={() => {
          continueChat();
        }}
      >
        <RefreshCcw className='size-3.5' />
        Try again
      </Button>
    ) : notice.primary === 'resume' ? (
      <Button
        variant='outline'
        size='sm'
        disabled={heldUntil !== undefined}
        onClick={() => {
          continueChat();
        }}
      >
        <Play className='size-3.5' />
        {heldUntil === undefined ? 'Resume' : `Resume at ${heldUntil}`}
      </Button>
    ) : notice.primary === 'new-chat' ? (
      <Button
        variant='outline'
        size='sm'
        disabled={!canOpenNewChat}
        onClick={() => {
          void openNewChat({ activeExecution: execution });
        }}
      >
        <MessageSquarePlus className='size-3.5' />
        New chat
      </Button>
    ) : null;

  const switchAgentAction = showSwitchAgent ? (
    /* The composer's picker is the owner, opened here as the credits card
     * opens the model picker. */
    <ChatExecutionSelector popoverProperties={{ align: 'end' }}>
      {() => (
        <Button variant='outline' size='sm'>
          <Repeat className='size-3.5' />
          Switch agent
        </Button>
      )}
    </ChatExecutionSelector>
  ) : null;

  const actions =
    showSwitchAgent || notice.primary ? (
      notice.switchAgentFirst === true ? (
        <>
          {switchAgentAction}
          {primaryAction}
        </>
      ) : (
        <>
          {primaryAction}
          {switchAgentAction}
        </>
      )
    ) : undefined;

  // A reset the agent sent as data is said in Tau's words and the reader's
  // clock; one it only wrote into its own sentence is left in its own words.
  const reason =
    heldUntil === undefined ? (
      <ProviderSentence text={stop.failure.title} />
    ) : (
      `Your ${usageWindowWord(stop.window)} limit resets at ${heldUntil}.`
    );

  return (
    <ChatErrorCard
      role={notice.live}
      aria-label={notice.heading}
      tone='notice'
      icon={notice.icon}
      className={className}
      title={notice.heading}
      description={
        notice.keepsTurn === true ? (
          <>
            <p>{reason}</p>
            <p>{turnSavedSentence}</p>
          </>
        ) : (
          reason
        )
      }
      actions={actions}
    >
      {stop.diagnostics === undefined ? null : (
        <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant='ghost' size='xs' className='-ml-1 text-muted-foreground'>
              <ChevronRight className={cn('size-3 transition-transform', isDetailsOpen && 'rotate-90')} />
              Details
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className='mt-1 max-h-40 overflow-auto rounded-sm bg-muted p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground'>
              {stop.diagnostics}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </ChatErrorCard>
  );
});
