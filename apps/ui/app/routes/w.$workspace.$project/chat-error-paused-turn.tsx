import { memo, useState } from 'react';
import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CircleAlert, Play, RefreshCcw, Repeat } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { CodeViewer } from '#components/code/code-viewer.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard, turnSavedSentence } from '#routes/w.$workspace.$project/chat-error-card.js';

type ChatErrorPausedTurnProps = {
  readonly className?: string;
  /** The provider's own sentence for what went wrong. */
  readonly reason: string;
  /**
   * Whether the host will continue this run rather than replay it, decided once
   * by `chat-error.tsx` from `isResumableRunFailure`. A card promises the turn
   * and says Resume only when it is `true`.
   */
  readonly resumable: boolean;
  /** Overrides the paused-turn heading; the refusal (S6) names itself. */
  readonly title?: string;
  readonly icon?: LucideIcon;
  /** What to change before resuming, said on the same line as the consequence. */
  readonly guidance?: string;
  /** Offer the composer's model picker ahead of Resume (S6). */
  readonly canSwitchModel?: boolean;
  /** Keep the destructive replay available after the safer Resume action. */
  readonly canTryAgain?: boolean;
  /** The raw failure payload, kept behind a disclosure below the copy. */
  readonly raw?: string;
};

/**
 * A model call that failed with the turn intact.
 *
 * A resumable one reads the same way every time: the provider's words, the
 * promise that the turn is saved, and **Resume**, which re-issues that one call
 * with every settled tool result still in the history. The verb states the
 * behaviour, so a failure the host rules unrecoverable makes no promise and
 * keeps *Try again* — the gesture it will actually get. Callers may retain a
 * separate replay action after Resume.
 */
export const ChatErrorPausedTurn = memo(function ({
  className,
  reason,
  resumable,
  title = 'Tau paused this turn',
  icon = CircleAlert,
  guidance,
  canSwitchModel = false,
  canTryAgain = false,
  raw,
}: ChatErrorPausedTurnProps): React.JSX.Element {
  const { continueChat, regenerate } = useChatActions();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <ChatErrorCard
      tone='warning'
      icon={icon}
      className={className}
      title={title}
      description={
        <>
          <p>{reason}</p>
          {resumable ? (
            <p>{guidance === undefined ? turnSavedSentence : `${turnSavedSentence} ${guidance}`}</p>
          ) : undefined}
        </>
      }
      actions={
        <>
          {canSwitchModel ? (
            /* The composer's picker is the owner, opened here as the credits
             * card opens it, without claiming its shortcut. */
            <ChatModelSelector popoverProperties={{ align: 'end' }}>
              {() => (
                <Button variant='outline' size='sm'>
                  <Repeat className='size-3.5' />
                  Switch model
                </Button>
              )}
            </ChatModelSelector>
          ) : null}
          <Button
            variant={resumable && canTryAgain ? 'default' : 'outline'}
            size='sm'
            onClick={() => {
              continueChat();
            }}
          >
            {resumable ? <Play className='size-3.5' /> : <RefreshCcw className='size-3.5' />}
            {resumable ? 'Resume' : 'Try again'}
          </Button>
          {resumable && canTryAgain ? (
            <Button variant='outline' size='sm' onClick={regenerate}>
              <RefreshCcw className='size-3.5' />
              Try again
            </Button>
          ) : null}
        </>
      }
    >
      {raw === undefined ? null : (
        <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant='ghost' size='xs' className='-ml-1 text-muted-foreground'>
              <ChevronRight className={cn('size-3 transition-transform', isDetailsOpen && 'rotate-90')} />
              Details
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='overflow-x-auto'>
            <CodeViewer text={raw} language='json' className='mt-1 text-xs whitespace-pre-wrap' />
          </CollapsibleContent>
        </Collapsible>
      )}
    </ChatErrorCard>
  );
});
