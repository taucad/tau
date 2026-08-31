import React, { useCallback, useState, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import { Info, Lock, LockIcon, LockOpen } from 'lucide-react';
import type { LengthSymbol } from '@taucad/units';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { cn } from '#utils/ui.utils.js';
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';
import { gridUnitOptions, maxGridDigits } from '#components/geometry/cad/grid-unit-options.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

type GridSizeIndicatorProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
};

const getTextSizeClass = (sizeText: string) => {
  const { length } = sizeText;

  if (length > 5) {
    return 'text-[calc(var(--spacing)*1.8)] font-semibold';
  }

  if (length > 3) {
    return 'text-[calc(var(--spacing)*2.2)] font-semibold';
  }

  return 'text-[calc(var(--spacing)*3)]';
};

/**
 * Component that displays the current grid size from the per-view GraphicsMachine via GraphicsProvider
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
        payload: { unit: selectedUnit as LengthSymbol },
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

  // If there's no valid grid size, don't render
  if (!gridSizes.smallSize) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant='overlay' size='icon' className={cn('relative font-mono [&>span]:leading-none', className)}>
              <span
                className={cn(
                  getTextSizeClass(localizedSmallGridSize),
                  'absolute top-2.75 flex -translate-y-1/2 items-center justify-center',
                )}
              >
                <span>{localizedSmallGridSize}</span>
              </span>
              <span className='absolute bottom-2.25 flex translate-y-1/2 items-center justify-center gap-0.25 text-xs tracking-wide'>
                {unit}
                {isGridSizeLocked ? <LockIcon className='size-2' strokeWidth={4} /> : null}
              </span>
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
