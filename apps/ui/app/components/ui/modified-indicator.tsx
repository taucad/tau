import { RefreshCcwDot } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

/**
 * Signals a value has been modified from its default.
 *
 * Below `md`: shows the reset icon only (always tappable).
 * `md` and up: small yellow dot; hover morphs into the reset icon.
 * Uses `group/modified` for hover on larger breakpoints.
 */
export function ModifiedIndicator({
  onReset,
  tooltip = 'Reset',
  tooltipSide = 'left',
  className,
}: {
  readonly onReset: () => void;
  readonly tooltip?: string;
  readonly tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className={cn('group/modified relative flex size-4 shrink-0 items-center justify-center', className)}
          aria-label={tooltip}
          onClick={(event) => {
            event.stopPropagation();
            onReset();
          }}
        >
          <span
            data-slot='dot'
            className='size-1.5 rounded-full bg-yellow opacity-0 transition-opacity md:opacity-100 md:group-hover/modified:opacity-0 dark:bg-yellow'
          />
          <RefreshCcwDot
            data-slot='icon'
            className='absolute inset-0 m-auto size-3 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover/modified:opacity-100'
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
