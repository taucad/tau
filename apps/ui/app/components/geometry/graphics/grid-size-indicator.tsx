import React, { useCallback } from 'react';
import type { ClassValue } from 'clsx';
import { Button } from '@/components/ui/button.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Switch } from '@/components/ui/switch.js';
import { cn } from '@/utils/ui.js';

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="overlay"
          size="icon"
          className={cn('flex-col gap-0 font-mono text-xs [&>span]:leading-none', className)}
        >
          <span>{displaySize}</span>
          <span>mm</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="space-y-2">
          <h3 className="font-medium">Grid</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Lock Grid Size ({displaySize} mm)</span>
            <Switch checked={isGridSizeLocked} onCheckedChange={handleLockToggle} />
          </div>
          <p className="text-xs text-muted-foreground">Tip: Adjust grid size by changing zoom level</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
