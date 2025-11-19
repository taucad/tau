import React, { useCallback, useState, useEffect, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import { Info, Lock, LockIcon, LockOpen } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { LengthSymbol } from '@taucad/units';
import { standardInternationalBaseUnits } from '@taucad/units/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useBuild } from '#hooks/use-build.js';
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
import { toTitleCase } from '#utils/string.utils.js';

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

const gridUnitOrder = ['mm', 'cm', 'm', 'in', 'ft', 'yd'] as const;

const gridUnitOptions = gridUnitOrder.map((symbol) => {
  if (symbol === standardInternationalBaseUnits.length.symbol) {
    // Base unit (Meter)
    return {
      label: toTitleCase(standardInternationalBaseUnits.length.unit),
      value: symbol as LengthSymbol,
    };
  }

  const variant = standardInternationalBaseUnits.length.variants.find((v) => v.symbol === symbol);
  return {
    label: variant ? toTitleCase(variant.unit) : symbol,
    value: symbol as LengthSymbol,
  };
});

/**
 * Component that displays the current grid size from the GraphicsProvider
 */
export function GridSizeIndicator({ className }: GridSizeIndicatorProps): React.ReactNode {
  const { graphicsRef: graphicsActor } = useBuild();
  const gridSizes = useSelector(graphicsActor, (state) => state.context.gridSizes);
  const isGridSizeLocked = useSelector(graphicsActor, (state) => state.context.isGridSizeLocked);
  const gridFactor = useSelector(graphicsActor, (state) => state.context.units.length.factor);
  const gridSystem = useSelector(graphicsActor, (state) => state.context.units.length.system);

  const [isOpen, setIsOpen] = useState(false);

  // Derive system from current gridUnit symbol to determine default
  const defaultUnit = gridSystem === 'imperial' ? ('in' as const) : ('mm' as const);

  const [unit, setUnit] = useCookie<LengthSymbol>(cookieName.cadUnit, defaultUnit);

  // Sync graphics machine with cookie value on change
  useEffect(() => {
    graphicsActor.send({
      type: 'setGridUnit',
      payload: { unit },
    });
  }, [unit, graphicsActor]);

  const handleLockToggle = useCallback(
    (checked: boolean) => {
      graphicsActor.send({ type: 'setGridSizeLocked', payload: checked });
    },
    [graphicsActor],
  );

  const handleUnitChange = useCallback(
    (selectedUnit: string) => {
      setUnit(selectedUnit as LengthSymbol);
    },
    [setUnit],
  );

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  // Convert the display size based on the unit
  const displaySize = gridSizes.smallSize / gridFactor;

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
        <TooltipContent>Change unit settings</TooltipContent>
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
