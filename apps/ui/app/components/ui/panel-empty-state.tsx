import type { LucideIcon } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

type PanelEmptyStateProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly iconClassName?: string;
};

export const PanelEmptyState = ({
  icon: Icon,
  title,
  description,
  iconClassName,
  className,
  children,
  ...properties
}: PanelEmptyStateProps): React.JSX.Element => (
  <div
    {...properties}
    data-slot='panel-empty-state'
    className={cn(
      '@container/panel-empty-state [container-type:size] flex size-full flex-col items-center justify-center p-2 text-center',
      className,
    )}
  >
    <div data-slot='panel-empty-state-icon' className='rounded-xl border bg-card p-2'>
      <Icon aria-hidden='true' className={cn('size-5 text-muted-foreground', iconClassName)} strokeWidth={1.5} />
    </div>
    <div data-slot='panel-empty-state-copy' className='mt-3 flex max-w-xs flex-col items-center gap-1 px-3'>
      <h3 data-slot='panel-empty-state-title' className='text-base font-medium text-foreground'>
        {title}
      </h3>
      {description ? (
        <p
          data-slot='panel-empty-state-description'
          className='text-sm leading-relaxed wrap-break-word text-muted-foreground'
        >
          {description}
        </p>
      ) : null}
    </div>
    {children ? (
      <div data-slot='panel-empty-state-content' className='mt-4 flex w-full justify-center'>
        {children}
      </div>
    ) : null}
  </div>
);
