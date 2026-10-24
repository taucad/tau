import { RefreshCcwDot } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/tooltip.js';
import { nestedActionVariants } from '#components/nested-action.variants.js';

/**
 * Signals a value has been modified from its default.
 *
 * Below `md`: shows the reset icon only (always tappable).
 * `md` and up: small yellow dot; hover morphs into the reset icon.
 * Under a coarse pointer (a tablet at `md` and up) the reset icon shows without hover and the
 * button grows to a 24px target (I2, I3).
 * Uses `group/modified` for hover on larger breakpoints. The dot is status and
 * stays visible at rest; the button's own hover surface is the nested-action
 * tone, so it reads as a control on a lit header.
 * @public
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
          className={nestedActionVariants({
            className: cn(
              'group/modified relative flex size-4 shrink-0 items-center justify-center rounded-md outline-none focus-visible:focus-outline pointer-coarse:size-6',
              className,
            ),
          })}
          aria-label={tooltip}
          onClick={(event) => {
            event.stopPropagation();
            onReset();
          }}
        >
          <span
            data-slot='dot'
            className='size-1.5 rounded-full bg-warning opacity-0 transition-opacity md:opacity-100 md:group-hover/modified:opacity-0 pointer-coarse:opacity-0!'
          />
          <RefreshCcwDot
            data-slot='icon'
            className='absolute inset-0 m-auto size-3 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover/modified:opacity-100 pointer-coarse:opacity-100!'
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
