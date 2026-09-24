import { memo } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cancelChatStreamKeyCombination } from '#components/chat/chat-textarea-types.js';
import { ariaKeyShortcuts, formatKeyCombination } from '#utils/keys.utils.js';
import { Loader } from '#components/ui/loader.js';
import { cn } from '@taucad/ui/utils/cn';

const chatComposerActionButtonClassName =
  'rounded-full bg-foreground text-background shadow-xs hover:bg-foreground/85 hover:text-background dark:bg-foreground dark:text-background dark:hover:bg-foreground/85 dark:hover:text-background';

type ChatStreamingStopButtonProperties = {
  readonly formattedCancelKeyCombination: string;
  readonly onCancel: () => void;
  /** `compact` fits a single-line `text-sm` user bubble without overlapping ascenders. */
  readonly variant?: 'default' | 'compact';
};

/**
 * Circular stop control used while a turn runs (the composer's, and the one
 * pinned to the live user bubble). Named, with its shortcut exposed (F1).
 */
export const ChatStreamingStopButton = memo(function ({
  formattedCancelKeyCombination,
  onCancel,
  variant = 'default',
}: ChatStreamingStopButtonProperties): React.JSX.Element {
  const isCompact = variant === 'compact';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='Stop'
          aria-keyshortcuts={ariaKeyShortcuts(cancelChatStreamKeyCombination)}
          className={cn(chatComposerActionButtonClassName, isCompact ? 'size-6' : 'size-7')}
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
        >
          <Square aria-hidden='true' className={cn('fill-background', isCompact ? 'size-3' : 'size-4')} />
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
  readonly isSubmitting: boolean;
  /** Why Send refuses right now, or `undefined` when it would send. */
  readonly refusal: string | undefined;
  /** The id of the text beside the attachments saying why Send refuses, when there is one (S14). */
  readonly describedBy?: string;
  readonly formattedCancelKeyCombination: string;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
};

/**
 * Send, or Stop while a turn runs.
 *
 * A refusing Send stays focusable (F14): it is `aria-disabled`, not
 * `disabled`, so a keyboard reaches it and its tooltip says why.
 */
export const ChatTextareaSubmitButton = memo(function ({
  status,
  isSubmitting,
  refusal,
  describedBy,
  formattedCancelKeyCombination,
  onSubmit,
  onCancel,
}: ChatTextareaSubmitButtonProperties): React.JSX.Element {
  if (['streaming', 'submitted'].includes(status)) {
    return (
      <ChatStreamingStopButton formattedCancelKeyCombination={formattedCancelKeyCombination} onCancel={onCancel} />
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='Send'
          aria-keyshortcuts='Enter'
          aria-disabled={refusal !== undefined}
          className={cn(
            chatComposerActionButtonClassName,
            'size-7 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-foreground',
          )}
          // Only when set: an explicit `undefined` would replace the tooltip's own description.
          {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          onClick={() => {
            if (refusal === undefined) {
              onSubmit();
            }
          }}
        >
          {isSubmitting ? <Loader className='size-4' /> : <ArrowUp aria-hidden='true' className='size-5' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className='flex items-center gap-2 align-baseline'>
        {refusal ?? (
          <>
            Send <KeyShortcut variant='tooltip'>{formatKeyCombination({ key: 'Enter' })}</KeyShortcut>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
