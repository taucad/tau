import React, { useCallback, useRef, useState, useMemo } from 'react';
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
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';
import { gridUnitOptions, maxGridDigits } from '#components/geometry/cad/grid-unit-options.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

/**
 * A one-line readout of the grid size from the per-view GraphicsMachine via GraphicsProvider, which opens the
 * units and grid menu.
 */
export function GridSizeIndicator(): React.ReactNode {
  const graphicsRef = useGraphics();
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const isGridSizeLocked = useGraphicsSelector((state) => state.context.isGridSizeLocked);
  const metersPerDisplayUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const unit = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);

  const [isOpen, setIsOpen] = useState(false);
  // A press outside leaves focus with the pointer; a keyboard close returns it to the trigger.
  const isClosingFromPointerRef = useRef(false);

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
              className='h-7 gap-1 px-2 font-mono text-xs tabular-nums has-[>svg]:px-2'
            >
              {/* Below 520 px of viewer width the readout keeps its value and drops its glyph. */}
              <Grid3X3 className='hidden size-3.5 text-muted-foreground @min-[520px]/viewer:block' />
              {gridLabel}
              {isGridSizeLocked ? <Lock className='size-3 text-muted-foreground' /> : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Change unit settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side='top'
        align='start'
        className='w-72'
        onPointerDownOutside={() => {
          isClosingFromPointerRef.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (isClosingFromPointerRef.current) {
            event.preventDefault();
          }
          isClosingFromPointerRef.current = false;
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
