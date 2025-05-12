import React, { useCallback } from 'react';
import type { ClassValue } from 'clsx';
import { Button } from '@/components/ui/button.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Switch } from '@/components/ui/switch.js';
import { cn } from '@/utils/ui.js';
import { formatNumber } from '@/utils/number.js';
import useCookie from '@/hooks/use-cookie.js';

type GridSizeIndicatorProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
};

/**
 * Component that displays the current grid size from the GraphicsProvider
 */
export function GridSizeIndicator({ className }: GridSizeIndicatorProps): React.ReactNode {
  const { gridSizes, isGridSizeLocked, setIsGridSizeLocked } = useGraphics();

  const [unit, setUnit] = useCookie<'mm' | 'in'>('cad-unit', 'mm');

  const handleLockToggle = useCallback(
    (checked: boolean) => {
      setIsGridSizeLocked(checked);
    },
    [setIsGridSizeLocked],
  );

  // If there's no valid grid size, don't render
  if (!gridSizes?.smallSize) {
    return null;
  }

  // Use current grid size for display
  const displaySize = gridSizes.smallSize;

  const getTextSizeClass = (sizeText: string) => {
    const { length } = sizeText;

    if (length > 8) return 'text-[0.3rem]';
    if (length > 7) return 'text-[0.35rem]';
    if (length > 6) return 'text-[0.4rem]';
    if (length > 5) return 'text-[0.45rem]';
    if (length > 4) return 'text-[0.5rem]';
    if (length > 3) return 'text-[0.55rem]';
    return 'text-xs';
  };

  const localizedSmallGridSize = formatNumber(displaySize);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="overlay"
          size="icon"
          className={cn('flex-col gap-0 font-mono text-xs [&>span]:leading-none', className)}
        >
          <span className={getTextSizeClass(localizedSmallGridSize)}>{localizedSmallGridSize}</span>
          <span>mm</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Units</span>
          <div className="flex items-center justify-between">
            <span className="text-sm">Lock Grid Size ({localizedSmallGridSize} mm)</span>
            <Switch checked={isGridSizeLocked} onCheckedChange={handleLockToggle} />
          </div>
          <p className="text-xs text-muted-foreground">Tip: Adjust grid size by changing zoom level</p>
          <h3 className="font-medium">Grid</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Lock Grid Size ({localizedSmallGridSize} mm)</span>
            <Switch checked={isGridSizeLocked} onCheckedChange={handleLockToggle} />
          </div>
          <p className="text-xs text-muted-foreground">Tip: Adjust grid size by changing zoom level</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
