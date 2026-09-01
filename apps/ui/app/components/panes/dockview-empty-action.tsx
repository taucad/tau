import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

type DockviewEmptyActionProps = Omit<ComponentProps<typeof Button>, 'variant'>;

export function DockviewEmptyAction({ className, ...properties }: DockviewEmptyActionProps): React.JSX.Element {
  return (
    <Button
      {...properties}
      variant='ghost'
      className={cn(
        'h-7 justify-start gap-2 rounded-sm bg-muted/40 px-3 text-[13px] font-normal hover:bg-muted/70',
        className,
      )}
    />
  );
}

export function DockviewEmptyCloseAction({
  children = 'Close tab',
  className,
  ...properties
}: DockviewEmptyActionProps): React.JSX.Element {
  return (
    <DockviewEmptyAction {...properties} className={cn('bg-transparent text-muted-foreground', className)}>
      <X aria-hidden className='size-3.5 shrink-0' />
      {children}
    </DockviewEmptyAction>
  );
}
