import { memo, useState } from 'react';
import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CircleAlert, Clock, Gauge, MessageSquarePlus, RefreshCcw, Repeat, Timer } from 'lucide-react';
import type { ExternalAgentStop } from '@taucad/agent-host';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { useChatActions } from '#hooks/use-chat.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { ChatExecutionSelector, useChatAgentSelection } from '#components/chat/chat-execution-selector.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';

type StopNotice = {
  readonly icon: LucideIcon;
  /** `status` for a stop the person's account explains, `alert` for an unexpected one. */
  readonly live: 'status' | 'alert';
  readonly heading: string;
  readonly primary?: 'retry' | 'new-chat';
  /** Whether another agent is the useful way forward. */
  readonly canSwitchAgent: boolean;
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
 * @param stop - The stop the run recorded.
 * @returns The notice copy and actions.
 */
export const describeAgentStop = (stop: ExternalAgentStop): StopNotice => {
  const name = externalAgentDisplayName(stop.agentId);
  const { category, actions } = stop.failure;
  const canRetry = actions.includes('retry');
  const needsNewChat = actions.includes('new_session');
  if (category === 'limit' && actions.length === 0) {
    return { icon: Gauge, live: 'status', heading: `${name} usage limit reached`, canSwitchAgent: true };
  }
  if (category === 'limit' && canRetry) {
    return { icon: Timer, live: 'status', heading: `${name} is rate limited`, primary: 'retry', canSwitchAgent: true };
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
  const notice = describeAgentStop(stop);
  const Icon = notice.icon;
  const showSwitchAgent = notice.canSwitchAgent && isAgentSelectorOffered;

  return (
    <section
      role={notice.live}
      aria-label={notice.heading}
      className={cn('flex min-w-0 flex-col gap-2 rounded-md border bg-background p-3 text-sm', className)}
    >
      <div className='flex min-w-0 items-start gap-2'>
        <Icon aria-hidden className='mt-0.5 size-4 shrink-0 text-feature' />
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='font-medium text-foreground'>{notice.heading}</p>
          <p className='text-xs break-words text-muted-foreground'>
            <ProviderSentence text={stop.failure.title} />
          </p>
        </div>
      </div>
      {showSwitchAgent || notice.primary ? (
        <div className='flex flex-wrap justify-end gap-2'>
          {showSwitchAgent ? (
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
          ) : null}
          {notice.primary === 'retry' ? (
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
          ) : null}
          {notice.primary === 'new-chat' ? (
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
          ) : null}
        </div>
      ) : null}
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
    </section>
  );
});
