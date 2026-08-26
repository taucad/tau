import * as React from 'react';
import { Slider } from '#components/ui/slider.js';
import { menuItemIconClass, menuItemLayoutClass } from '#components/ui/menu.variants.js';
import { cn } from '#utils/ui.utils.js';

export type MenuSliderItemProperties = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly infoTooltip?: React.ReactNode;
  readonly formatValue?: (value: number) => string;
  readonly dataSlot: string;
};

export function MenuSliderItem({
  className,
  children,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  infoTooltip,
  formatValue,
  dataSlot,
}: MenuSliderItemProperties): React.JSX.Element {
  const handleValueChange = React.useCallback(
    (values: number[]) => {
      const newValue = values[0];
      if (newValue !== undefined) {
        onValueChange?.(newValue);
      }
    },
    [onValueChange],
  );

  const displayValue = formatValue ? formatValue(value) : `${value}`;

  return (
    <div
      data-slot={dataSlot}
      className={cn('px-3 py-2', className)}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div className='mb-2 flex items-center justify-between'>
        <span className={cn(menuItemLayoutClass, menuItemIconClass, 'text-sm')}>
          {children}
          {infoTooltip}
        </span>
        <span className='text-xs text-muted-foreground'>{displayValue}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} className='w-full' onValueChange={handleValueChange} />
    </div>
  );
}
