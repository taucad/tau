import { memo } from 'react';
import type React from 'react';
import { Clock, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { useChatActions } from '#hooks/use-chat.js';

export const ChatErrorRateLimit = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const { continueChat } = useChatActions();

  return (
    <div className={cn('flex flex-col gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm', className)}>
      <div className='flex items-center gap-2'>
        <Clock className='size-4 shrink-0 text-warning' />
        <p className='font-medium text-foreground'>Rate Limit Exceeded</p>
      </div>
      <p className='text-xs text-muted-foreground'>Too many requests. Please wait a moment before trying again.</p>
      <div className='flex justify-end'>
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
      </div>
    </div>
  );
});
