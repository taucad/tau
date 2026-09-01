import { Badge } from '#components/ui/badge.js';
import { cn } from '#utils/ui.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export function ReleaseBadge(): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className='h-6 cursor-help border-purple/30 bg-purple/10 text-xs font-normal text-purple dark:text-purple/70'>
          BETA
        </Badge>
      </TooltipTrigger>
      <TooltipContent className='max-w-42 text-balance'>
        <p className='font-semibold'>Tau is in Beta</p>
        <p className='mt-1 text-white/80'>Some features may be unstable and change without notice.</p>
      </TooltipContent>
    </Tooltip>
  );
}

type BetaBadgeProps = {
  readonly className?: string;
};

/**
 * Compact inline beta marker reusing the purple ramp from `ReleaseBadge`.
 * Intended for tagging individual features (e.g. WebGPU option in the viewer
 * backend selector) where a tooltip wrapper would be redundant.
 */
export function BetaBadge({ className }: BetaBadgeProps): React.JSX.Element {
  return (
    <Badge
      className={cn(
        'h-4 border-purple/30 bg-purple/10 px-1 text-[10px] leading-none font-medium tracking-wide text-purple uppercase dark:text-purple/70',
        className,
      )}
    >
      Beta
    </Badge>
  );
}
