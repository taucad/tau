import React, { useCallback, useState } from 'react';
import type { ClassValue } from 'clsx';
import { LockIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { Button } from '@/components/ui/button.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
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

const gridUnitOptions = [
  { label: 'Millimeter', value: 'mm', system: 'metric', factor: 1 },
  { label: 'Centimeter', value: 'cm', system: 'metric', factor: 10 },
  { label: 'Meter', value: 'm', system: 'metric', factor: 1000 },
  { label: 'Inch', value: 'in', system: 'imperial', factor: 1 }, // Base unit for imperial
  { label: 'Foot', value: 'ft', system: 'imperial', factor: 12 }, // 1 foot = 12 inches
] as const;

type GridUnitOption = (typeof gridUnitOptions)[number]['value'];

/**
 * Component that displays the current grid size from the GraphicsProvider
 */
export function GridSizeIndicator({ className }: GridSizeIndicatorProps): React.ReactNode {
  const { gridSizes, isGridSizeLocked, setIsGridSizeLocked, setGridUnit, gridUnitSystem } = useGraphics();
  const [isOpen, setIsOpen] = useState(false);

  // Use the current gridUnitSystem to select an appropriate default unit
  const defaultUnit = gridUnitSystem === 'imperial' ? 'in' : 'mm';
  const [unit, setUnit] = useCookie<GridUnitOption>('cad-unit', defaultUnit as GridUnitOption);

  const handleLockToggle = useCallback(
    (checked: boolean) => {
      setIsGridSizeLocked(checked);
    },
    [setIsGridSizeLocked],
  );

  const handleUnitSelect = useCallback(
    (selectedUnit: GridUnitOption) => {
      const selectedOption = gridUnitOptions.find((option) => option.value === selectedUnit);
      if (selectedOption) {
        setUnit(selectedUnit);
        // Update the unit in the graphics context
        setGridUnit(selectedOption.value, selectedOption.factor, selectedOption.system);
      }
    },
    [setUnit, setGridUnit],
  );

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  // If there's no valid grid size, don't render
  if (!gridSizes?.smallSize) {
    return null;
  }

  // Find the current unit's conversion factor
  const currentUnitOption = gridUnitOptions.find((option) => option.value === unit) ?? gridUnitOptions[0];

  // Convert the display size based on the unit
  // For both metric and imperial, we divide by the unit factor
  // (The comment is kept to explain different scenarios but the calculation is the same)
  const displaySize = gridSizes.smallSize / currentUnitOption.factor;

  const localizedSmallGridSize = formatNumber(displaySize);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="overlay"
              size="icon"
              className={cn('flex-col gap-0 font-mono text-xs [&>span]:leading-none', className)}
            >
              <span className={getTextSizeClass(localizedSmallGridSize)}>{localizedSmallGridSize}</span>
              <span className="flex items-center gap-0.5">
                {unit}
                {isGridSizeLocked ? <LockIcon className="size-2" /> : null}
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
        <DropdownMenuLabel>Units</DropdownMenuLabel>
        {gridUnitOptions.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={unit === option.value}
            onCheckedChange={() => {
              handleUnitSelect(option.value);
            }}
            onSelect={preventClose}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Grid</DropdownMenuLabel>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleLockToggle(!isGridSizeLocked);
          }}
          onSelect={preventClose}
        >
          <span>
            Lock Grid Size ({localizedSmallGridSize} {unit})
          </span>
          <Switch
            className="data-[state=unchecked]:bg-muted-foreground!"
            checked={isGridSizeLocked}
            onCheckedChange={handleLockToggle}
          />
        </DropdownMenuItem>
        <span className="p-2 text-xs font-medium text-muted-foreground/80">
          Tip: Adjust grid size by changing zoom level
        </span>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
