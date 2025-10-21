import React, { useCallback, useState, useEffect, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import { Info, Lock, LockIcon, LockOpen } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { useCookie } from '#hooks/use-cookie.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
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
import { cookieName } from '#constants/cookie.constants.js';
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';

type GridSizeIndicatorProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
};

const getTextSizeClass = (sizeText: string) => {
  const { length } = sizeText;

  if (length > 3) {
    return 'text-[calc(var(--spacing)*2.2)] font-semibold';
  }

  return 'text-[calc(var(--spacing)*3)]';
};

const maxDigits = 3;

const gridUnitOptions = [
  { label: 'Millimeter', value: 'mm', system: 'metric', factor: 1 },
  { label: 'Centimeter', value: 'cm', system: 'metric', factor: 10 },
  { label: 'Meter', value: 'm', system: 'metric', factor: 1000 },
  { label: 'Inch', value: 'in', system: 'imperial', factor: 25.4 }, // Base unit for imperial
  { label: 'Foot', value: 'ft', system: 'imperial', factor: 304.8 }, // 1 foot = 12 inches
  { label: 'Yard', value: 'yd', system: 'imperial', factor: 914.4 }, // 1 yard = 3 feet
] as const;

type GridUnitOption = (typeof gridUnitOptions)[number]['value'];

/**
 * Component that displays the current grid size from the GraphicsProvider
 */
export function GridSizeIndicator({ className }: GridSizeIndicatorProps): React.ReactNode {
  const gridSizes = useSelector(graphicsActor, (state) => state.context.gridSizes);
  const isGridSizeLocked = useSelector(graphicsActor, (state) => state.context.isGridSizeLocked);
  const gridUnitSystem = useSelector(graphicsActor, (state) => state.context.gridUnitSystem);

  const [isOpen, setIsOpen] = useState(false);

  // Use the current gridUnitSystem to select an appropriate default unit
  const defaultUnit = gridUnitSystem === 'imperial' ? 'in' : 'mm';
  const [unit, setUnit] = useCookie<GridUnitOption>(cookieName.cadUnit, defaultUnit as GridUnitOption);

  // Sync graphics machine with cookie value on change
  useEffect(() => {
    const currentUnitOption = gridUnitOptions.find((option) => option.value === unit);
    if (currentUnitOption) {
      graphicsActor.send({
        type: 'setGridUnit',
        payload: {
          unit: currentUnitOption.value,
          factor: currentUnitOption.factor,
          system: currentUnitOption.system,
        },
      });
    }
  }, [unit]);

  const handleLockToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setGridSizeLocked', payload: checked });
  }, []);

  const handleUnitChange = useCallback(
    (selectedUnit: string) => {
      const selectedOption = gridUnitOptions.find((option) => option.value === selectedUnit);
      if (!selectedOption) {
        return;
      }

      setUnit(selectedUnit as GridUnitOption);
    },
    [setUnit],
  );

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  // Find the current unit's conversion factor
  const currentUnitOption = gridUnitOptions.find((option) => option.value === unit) ?? gridUnitOptions[0];

  // Convert the display size based on the unit
  // For both metric and imperial, we divide by the unit factor
  // (The comment is kept to explain different scenarios but the calculation is the same)
  const displaySize = gridSizes.smallSize / currentUnitOption.factor;

  const localizedSmallGridSize = useMemo(() => formatNumberEngineeringNotation(displaySize, maxDigits), [displaySize]);

  // If there's no valid grid size, don't render
  if (!gridSizes.smallSize) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="overlay" size="icon" className={cn('relative font-mono [&>span]:leading-none', className)}>
              <span
                className={cn(
                  getTextSizeClass(localizedSmallGridSize),
                  'absolute top-2.75 flex -translate-y-1/2 items-center justify-center',
                )}
              >
                <span>{localizedSmallGridSize}</span>
              </span>
              <span className="absolute bottom-2.25 flex translate-y-1/2 items-center justify-center gap-0.25 text-xs tracking-wide">
                {unit}
                {isGridSizeLocked ? <LockIcon className="size-2" strokeWidth={4} /> : null}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Change grid size</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-72"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuLabel>Unit</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={unit} onValueChange={handleUnitChange}>
          {gridUnitOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              className="flex items-center justify-between gap-2"
              value={option.value}
              onSelect={preventClose}
            >
              <span>{option.label}</span>
              <span className="flex w-8 items-center justify-center rounded-xs bg-neutral/20 px-1 py-0.5 font-mono text-xs">
                {option.value}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Grid</DropdownMenuLabel>
        <DropdownMenuSwitchItem
          className="flex w-full justify-between"
          isChecked={isGridSizeLocked}
          onIsCheckedChange={handleLockToggle}
        >
          <span data-locked={isGridSizeLocked} className="group flex items-center gap-2">
            <Lock className="hidden size-4 group-data-[locked=true]:block" />
            <LockOpen className="block size-4 group-data-[locked=true]:hidden" />
            Lock Grid Size ({localizedSmallGridSize} {unit})
          </span>
        </DropdownMenuSwitchItem>
        <span className="inline-flex items-center gap-1 p-2 text-xs font-medium text-muted-foreground/80">
          <Info className="size-3 stroke-2" /> Adjust grid size by changing zoom level
        </span>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
