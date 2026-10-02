import { memo } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { Loader } from '#components/ui/loader.js';
import { cn } from '#utils/ui.utils.js';

const chatComposerActionButtonClassName =
  'rounded-full bg-foreground text-background shadow-xs hover:bg-foreground/85 hover:text-background dark:bg-foreground dark:text-background dark:hover:bg-foreground/85 dark:hover:text-background';

type ChatStreamingStopButtonProperties = {
  readonly formattedCancelKeyCombination: string;
  readonly onCancel: () => void;
  /** `compact` fits a single-line `text-sm` user bubble without overlapping ascenders. */
  readonly variant?: 'default' | 'compact';
};

/**
 * Circular stop control used while the assistant stream is active (textarea
 * shortcut affordance and pinned shortcut on the live user bubble).
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
          className={cn(chatComposerActionButtonClassName, isCompact ? 'size-6' : 'size-7')}
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
        >
          <Square className={cn('fill-background', isCompact ? 'size-3' : 'size-4')} />
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
  readonly isDisabled: boolean;
  readonly formattedCancelKeyCombination: string;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
};

/**
 * Shared submit/cancel button component for the chat textarea.
 * Shows a stop button when streaming, otherwise shows a submit button.
 */
export const ChatTextareaSubmitButton = memo(function ({
  status,
  isSubmitting,
  isDisabled,
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
          variant='ghost'
          size='icon'
          className={cn(chatComposerActionButtonClassName, 'size-7')}
          disabled={isDisabled || isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? <Loader className='size-4' /> : <ArrowUp className='size-5' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className='flex items-center gap-2 align-baseline'>
        Send <KeyShortcut variant='tooltip'>{formatKeyCombination({ key: 'Enter' })}</KeyShortcut>
      </TooltipContent>
    </Tooltip>
  );
});
