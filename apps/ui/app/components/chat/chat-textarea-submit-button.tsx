import { memo } from 'react';
import { ArrowUp, Play, Square } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { usePlatform } from '@taucad/ui/hooks/use-platform';
import { ariaKeyShortcuts, formatKeyCombination } from '@taucad/ui/utils/keys';
import type { KeyCombination } from '@taucad/ui/utils/keys';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';

/**
 * The key combination that cancels the stream. Kept here rather than with the composer logic so the served Send button
 * (the project route's workspace frame) does not pull the composer providers into its bundle.
 */
export const cancelChatStreamKeyCombination = {
  key: 'Backspace',
  modKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

/** Monochrome action treatment shared by the composer and question replies. */
export const chatComposerActionButtonClassName =
  'rounded-full bg-foreground text-background shadow-xs hover:bg-foreground/85 hover:text-background dark:bg-foreground dark:text-background dark:hover:bg-foreground/85 dark:hover:text-background';

type ChatStreamingStopButtonProperties = {
  readonly formattedCancelKeyCombination: string;
  readonly onCancel: () => void;
};

/** Circular composer stop control with its keyboard shortcut exposed (F1). */
const ChatStreamingStopButton = memo(function ({
  formattedCancelKeyCombination,
  onCancel,
}: ChatStreamingStopButtonProperties): React.JSX.Element {
  const platform = usePlatform();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='Stop'
          aria-keyshortcuts={ariaKeyShortcuts(cancelChatStreamKeyCombination, platform)}
          className={cn(chatComposerActionButtonClassName, 'size-7')}
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
        >
          <Square aria-hidden='true' className='size-4 fill-background' />
        </Button>
      </TooltipTrigger>
      <TooltipContent className='flex items-center gap-2 align-baseline'>
        Stop <KeyShortcut variant='tooltip'>{formattedCancelKeyCombination}</KeyShortcut>
      </TooltipContent>
    </Tooltip>
  );
});

type ChatTextareaSubmitButtonProperties = {
  readonly status: string;
  /**
   * A run that cannot stream still holds the chat: paused on an approval, or stopping until its host settles it. Stop
   * is offered then too, so a run paused on an approval can always be stopped.
   */
  readonly canStop?: boolean;
  readonly canResume?: boolean;
  readonly isSubmitting: boolean;
  /** Dictation is under way: a running turn offers Send (queue the dictated follow-up) beside the dictation's own stop. */
  readonly isDictating?: boolean;
  /** Why Send refuses right now, or `undefined` when it would send. */
  readonly refusal: string | undefined;
  /** The id of the text beside the attachments saying why Send refuses, when there is one (S14). */
  readonly describedBy?: string;
  readonly formattedCancelKeyCombination: string;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
};

/**
 * Send a draft, Resume interrupted work, or Stop while a turn runs. While dictating, a running turn still offers
 * Send, so the dictation pill's stop square never sits beside a second Stop.
 *
 * A refusing Send stays focusable (F14): it is `aria-disabled`, not
 * `disabled`, so a keyboard reaches it and its tooltip says why.
 */
export const ChatTextareaSubmitButton = memo(function ({
  status,
  canStop = false,
  canResume = false,
  isSubmitting,
  isDictating = false,
  refusal,
  describedBy,
  formattedCancelKeyCombination,
  onSubmit,
  onCancel,
}: ChatTextareaSubmitButtonProperties): React.JSX.Element {
  if (!isDictating && (canStop || ['streaming', 'submitted'].includes(status))) {
    return (
      <ChatStreamingStopButton formattedCancelKeyCombination={formattedCancelKeyCombination} onCancel={onCancel} />
    );
  }

  const label = canResume ? 'Resume' : 'Send';
  const icon = canResume ? (
    <Play aria-hidden='true' className='fill-current' />
  ) : (
    <ArrowUp aria-hidden='true' className='size-5' />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size={canResume ? 'sm' : 'icon-sm'}
          aria-label={label}
          aria-keyshortcuts='Enter'
          aria-disabled={refusal !== undefined}
          className={cn(
            chatComposerActionButtonClassName,
            'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-foreground',
            '[[data-queued-send]_&]:opacity-100 [[data-early-text]_&]:opacity-100',
          )}
          // Only when set: an explicit `undefined` would replace the tooltip's own description.
          {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          onClick={() => {
            if (refusal === undefined) {
              onSubmit();
            }
          }}
        >
          {isSubmitting ? (
            <Loader className='size-4' />
          ) : (
            /* Before the rich composer is here, an Enter in the served input queues the send and marks the box
             * (`data-queued-send`, set by the early input's script): the button shows its pending state at once. */
            <>
              <span className='contents [[data-queued-send]_&]:hidden'>{icon}</span>
              <Loader className='hidden size-4 [[data-queued-send]_&]:block' />
            </>
          )}
          {canResume ? label : undefined}
        </Button>
      </TooltipTrigger>
      <TooltipContent className='flex items-center gap-2 align-baseline'>
        {refusal ?? (
          <>
            {label} <KeyShortcut variant='tooltip'>{formatKeyCombination({ key: 'Enter' })}</KeyShortcut>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * Send at rest, as the served composer draws it before the rich composer is here: the same button face as
 * {@link ChatTextareaSubmitButton}'s Send, with no tooltip (nothing can act on it yet, and the served page has no
 * tooltip provider). Its pending state shows while an Enter typed into the served input queues the send.
 *
 * @param props - Whether the input holds nothing to send.
 * @returns The button.
 */
export function ServedSendButton({ isEmpty }: { readonly isEmpty: boolean }): React.JSX.Element {
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-sm'
      aria-label='Send'
      aria-keyshortcuts='Enter'
      aria-disabled={isEmpty}
      className={cn(
        chatComposerActionButtonClassName,
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-foreground',
        '[[data-queued-send]_&]:opacity-100 [[data-early-text]_&]:opacity-100',
      )}
    >
      <span className='contents [[data-queued-send]_&]:hidden'>
        <ArrowUp aria-hidden='true' className='size-5' />
      </span>
      <Loader className='hidden size-4 [[data-queued-send]_&]:block' />
    </Button>
  );
}
