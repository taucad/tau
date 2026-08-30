import * as React from 'react';
import { menuItemVariants } from '#components/ui/menu.variants.js';
import { SliderInput } from '#components/ui/slider-input.js';
import { cn } from '#utils/ui.utils.js';

export type MenuSliderItemProperties = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly trailingAdornment?: React.ReactNode;
  readonly 'aria-label': string;
  readonly dataSlot: string;
};

export const preventMenuSliderEscapeDismissal = (event: { preventDefault: () => void }): void => {
  const { activeElement } = document;
  if (activeElement instanceof HTMLInputElement && activeElement.dataset['slot'] === 'slider-input-input') {
    event.preventDefault();
  }
};

const stopPointerPropagation = (event: React.PointerEvent<HTMLDivElement>): void => {
  event.stopPropagation();
};

export const MenuSliderItem = ({
  className,
  children,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  trailingAdornment,
  'aria-label': ariaLabel,
  dataSlot,
}: MenuSliderItemProperties): React.JSX.Element => (
  <SliderInput
    dataSlot={dataSlot}
    value={value}
    min={min}
    max={max}
    step={step}
    leadingContent={children}
    trailingAdornment={
      trailingAdornment ? (
        <span aria-hidden='true' className='ml-0.5 text-muted-foreground'>
          {trailingAdornment}
        </span>
      ) : undefined
    }
    className={cn(menuItemVariants(), 'w-full focus-within:text-foreground', className)}
    aria-label={ariaLabel}
    onScrubChange={onValueChange}
    onInputCommit={onValueChange}
    onPointerDown={stopPointerPropagation}
    onPointerMove={stopPointerPropagation}
    onPointerUp={stopPointerPropagation}
    onPointerCancel={stopPointerPropagation}
  />
);
