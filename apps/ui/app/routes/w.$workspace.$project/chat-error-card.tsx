import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

type ChatErrorCardTone = 'neutral' | 'warning' | 'notice';

/**
 * The consequence a kept turn states, outside every disclosure.
 *
 * One string so the recovery cards cannot drift apart on the promise they make
 * (DESIGN: the consequence and the action never fold away).
 */
export const turnSavedSentence = 'Everything up to here is saved.';

/**
 * Where a card hands its title to be said, when a chat's one announcement says its failure (`ChatErrorAnnouncement`).
 * The card is then a group labelled by its title, so a failure that moves between places is never a second alert.
 * Without one, the card is the alert itself.
 */
export const chatErrorReportContext = createContext<((title: string) => void) | undefined>(undefined);

const iconClassName: Record<ChatErrorCardTone, string> = {
  neutral: 'text-muted-foreground',
  warning: 'text-feature',
  notice: 'text-feature',
};

type ChatErrorCardProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  readonly tone: ChatErrorCardTone;
  readonly icon?: LucideIcon;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  /** Buttons, the action that resolves the stop first. */
  readonly actions?: React.ReactNode;
};

/**
 * A compact recovery row in the chat error slot.
 *
 * The summary and content-sized actions share a neutral surface. Actions stay
 * right-aligned and wrap below the summary when the pane cannot fit both.
 * Diagnostic content, when mounted, follows the recovery row.
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
  className,
  children,
  ...properties
}: ChatErrorCardProps): React.JSX.Element {
  const report = useContext(chatErrorReportContext);
  const isAnnounced = report === undefined;
  const titleId = useId();
  const titleRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const text = titleRef.current?.textContent ?? '';
    if (report !== undefined && text !== '') {
      report(text);
    }
  }, [report, title]);
  return (
    <section
      role={isAnnounced ? 'alert' : 'group'}
      aria-labelledby={isAnnounced ? undefined : titleId}
      data-slot='chat-error-card'
      className={cn('flex min-w-0 flex-col gap-2 rounded-md border bg-muted/40 p-2 text-sm', className)}
      {...properties}
    >
      <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
        <div className='flex min-w-0 flex-1 basis-48 items-start gap-2'>
          {Icon ? <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', iconClassName[tone])} /> : null}
          <div className='min-w-0 flex-1 space-y-1'>
            <p ref={titleRef} id={titleId} className='font-medium break-words text-foreground'>
              {title}
            </p>
            {description ? <div className='text-xs break-words text-muted-foreground'>{description}</div> : null}
          </div>
        </div>
        {actions ? (
          <div
            data-slot='chat-error-card-actions'
            className='ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5'
          >
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
