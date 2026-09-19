import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

type ChatErrorCardTone = 'neutral' | 'warning' | 'destructive' | 'notice';

/**
 * The consequence a kept turn states, outside every disclosure.
 *
 * One string so the recovery cards cannot drift apart on the promise they make
 * (DESIGN: the consequence and the action never fold away).
 */
export const turnSavedSentence = 'Everything up to here is saved.';

const toneClassName: Record<ChatErrorCardTone, string> = {
  neutral: 'bg-muted',
  warning: 'border-warning/20 bg-warning/10',
  destructive: 'border-destructive/20 bg-destructive/10',
  notice: 'bg-background',
};

const iconClassName: Record<ChatErrorCardTone, string> = {
  neutral: 'text-muted-foreground',
  warning: 'text-warning',
  destructive: 'text-destructive',
  notice: 'text-feature',
};

type ChatErrorCardProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  readonly tone: ChatErrorCardTone;
  readonly icon?: LucideIcon;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  /** Buttons, the action that resolves the stop first. */
  readonly actions?: React.ReactNode;
  /**
   * Card width at which the actions leave their stack for one row: 20 rem, or
   * 24 rem for a card with three actions.
   */
  readonly actionsRowFrom?: 'xs' | 'sm';
};

/**
 * The notice card of the chat error slot.
 *
 * The card sizes its actions by its own width, not the window's, because the
 * chat panel is usually far narrower than the viewport: below `actionsRowFrom`
 * they stack at full width, above it they share one row at equal widths.
 * Labels may wrap so large text never pushes a button out of the card.
 *
 * @param properties - Tone, optional icon, copy, actions and any trailing content.
 * @returns The card.
 * @example
 * ```tsx
 * <ChatErrorCard tone='warning' icon={Clock} title='Rate limit exceeded' actions={<Button>Try again</Button>} />
 * ```
 */
export function ChatErrorCard({
  tone,
  icon: Icon,
  title,
  description,
  actions,
  actionsRowFrom = 'xs',
  className,
  children,
  ...properties
}: ChatErrorCardProps): React.JSX.Element {
  return (
    <section
      data-slot='chat-error-card'
      className={cn(
        '@container flex min-w-0 flex-col gap-3 rounded-md border p-3 text-sm',
        toneClassName[tone],
        className,
      )}
      {...properties}
    >
      <div className='flex min-w-0 items-start gap-2'>
        {Icon ? <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', iconClassName[tone])} /> : null}
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='font-medium text-foreground'>{title}</p>
          {description ? <div className='text-xs break-words text-muted-foreground'>{description}</div> : null}
        </div>
      </div>
      {actions ? (
        <div
          data-slot='chat-error-card-actions'
          className={cn(
            'flex flex-col gap-2 *:h-auto *:min-h-8 *:whitespace-normal',
            actionsRowFrom === 'xs' ? '@xs:flex-row @xs:*:flex-1' : '@sm:flex-row @sm:*:flex-1',
          )}
        >
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
