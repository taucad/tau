import React, { useCallback, useState, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import { Grid3X3, Info, Lock, LockOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';
import { gridUnitOptions, maxGridDigits } from '#components/geometry/cad/grid-unit-options.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

type GridSizeIndicatorProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
};

/**
 * A one-line readout of the grid size from the per-view GraphicsMachine via GraphicsProvider, which opens the
 * units and grid menu.
 */
export function GridSizeIndicator({ className }: GridSizeIndicatorProps): React.ReactNode {
  const graphicsRef = useGraphics();
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const isGridSizeLocked = useGraphicsSelector((state) => state.context.isGridSizeLocked);
  const metersPerDisplayUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const unit = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);

  const [isOpen, setIsOpen] = useState(false);

  const handleLockToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setGridSizeLocked', payload: checked });
    },
    [graphicsRef],
  );

  const handleUnitChange = useCallback(
    (selectedUnit: string) => {
      graphicsRef.send({
        type: 'setGridUnit',
        payload: { unit: selectedUnit },
      });
    },
    [graphicsRef],
  );

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  // Convert the display size based on the unit
  const displaySize = gridSizes.smallSize / metersPerDisplayUnit;

  const localizedSmallGridSize = useMemo(
    () => formatNumberEngineeringNotation(displaySize, maxGridDigits),
    [displaySize],
  );
  const gridLabel = `${localizedSmallGridSize} ${unit}`;

  // If there's no valid grid size, don't render
  if (!gridSizes.smallSize) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              aria-label={`Grid ${gridLabel}, units and grid`}
              className={cn('h-7 gap-1 px-2 font-mono text-xs tabular-nums', className)}
            >
              <Grid3X3 className='size-3.5 text-muted-foreground' />
              {gridLabel}
              {isGridSizeLocked ? <Lock className='size-3 text-muted-foreground' /> : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Change unit settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className='w-72'
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuLabel>Unit</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={unit} onValueChange={handleUnitChange}>
          {gridUnitOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              className='flex items-center justify-between gap-2'
              value={option.value}
              onSelect={preventClose}
            >
              <span>{option.label}</span>
              <span className='flex w-8 items-center justify-center rounded-xs bg-neutral/20 px-1 py-0.5 font-mono text-xs'>
                {option.value}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Grid</DropdownMenuLabel>
        <DropdownMenuSwitchItem isChecked={isGridSizeLocked} onIsCheckedChange={handleLockToggle}>
          {isGridSizeLocked ? <Lock /> : <LockOpen />}
          Lock Grid Size ({localizedSmallGridSize} {unit})
        </DropdownMenuSwitchItem>
        <span className='inline-flex items-center gap-1 p-2 text-xs font-medium text-muted-foreground/80'>
          <Info className='size-3 stroke-2' /> Adjust grid size by changing zoom level
        </span>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
