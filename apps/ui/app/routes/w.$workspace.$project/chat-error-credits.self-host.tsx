import { memo } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { useChatActions } from '#hooks/use-chat.js';

export const ChatErrorCredits = memo(function ({
  className,
}: {
  readonly className?: string;
  readonly description?: string;
  readonly details?: Record<string, unknown>;
}): React.JSX.Element {
  const { continueChat } = useChatActions();
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm', className)}>
      <p className='font-medium text-foreground'>Request could not be completed</p>
      <p className='text-xs text-muted-foreground'>Retry with the providers configured by this server.</p>
      <Button className='self-end' variant='ghost' size='sm' onClick={continueChat}>
        <RefreshCcw className='size-3.5' /> Retry
      </Button>
    </div>
  );
});
