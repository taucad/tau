import { memo } from 'react';
import type React from 'react';
import { CreditCard, Play } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useChatActions } from '#hooks/use-chat.js';

type ChatErrorCreditsProps = {
  readonly className?: string;
  readonly description?: string;
};

const fallbackDescription = 'Your credit balance is too low. Add credits, then resume this chat.';

export const ChatErrorCredits = memo(function ({ className, description }: ChatErrorCreditsProps): React.JSX.Element {
  const { continueChat } = useChatActions();
  const resolvedDescription = description ?? fallbackDescription;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm',
        className,
      )}
    >
      <div className='flex items-center gap-2'>
        <CreditCard className='size-4 shrink-0 text-warning' />
        <p className='font-medium text-foreground'>Credit Limit Reached</p>
      </div>
      <p className='min-w-0 text-xs break-words text-muted-foreground'>{resolvedDescription}</p>
      <div className='flex flex-wrap items-center justify-end gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            openSettingsDialog('billing');
          }}
        >
          <CreditCard className='size-3.5' />
          Plans & Billing
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            continueChat();
          }}
        >
          <Play className='size-3.5' />
          Resume
        </Button>
      </div>
    </div>
  );
});
