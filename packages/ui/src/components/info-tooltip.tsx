import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/tooltip.js';
import { cn } from '#utils/cn.js';

/**
 * An info glyph that explains its neighbour in a tooltip.
 *
 * @param props - The tooltip content and classes.
 * @returns The glyph with its tooltip.
 *
 * @public
 */
export function InfoTooltip({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'flex items-center justify-center text-foreground/50 hover:text-foreground/70 max-md:hidden',
            className,
          )}
        >
          <Info className='size-4' />
        </span>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
