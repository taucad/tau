import { memo } from 'react';
import type React from 'react';
import { Play, WifiOff } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { useChatActions } from '#hooks/use-chat.js';

export const ChatErrorServiceUnavailable = memo(function ({
  className,
}: {
  readonly className?: string;
}): React.JSX.Element {
  const { continueChat } = useChatActions();

  return (
    <div className={cn('flex flex-col gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm', className)}>
      <div className='flex items-center gap-2'>
        <WifiOff className='size-4 shrink-0 text-warning' />
        <p className='font-medium text-foreground'>Unable to reach Tau</p>
      </div>
      <p className='text-xs text-muted-foreground'>
        We couldn&apos;t connect to the Tau service. This could be due to a network issue or the service may be
        temporarily unavailable. Please check your connection and try again.
      </p>
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            // Resume the interrupted stream WITHOUT slicing the trailing assistant
            // tail. `regenerate()` would discard partial parts the user already
            // saw -- the whole point of this banner is recovery, not re-roll.
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
