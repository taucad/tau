import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/cn.js';

/**
 * Build class names for standard and inset slider layouts.
 *
 * @public
 *
 * @example <caption>Style an inset slider</caption>
 * ```typescript
 * import { sliderVariants } from '@taucad/ui/components/slider';
 *
 * export const className = sliderVariants({ variant: 'inset' });
 * ```
 */
const sliderVariants = cva(
  'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
  {
    variants: {
      variant: {
        default: '',
        inset: [
          // The slider thumb is hidden via opacity and size, but still active for accessibility.
          '[&_[data-slot=slider-thumb]]:opacity-0',
          '[&_[data-slot=slider-thumb]]:size-0',

          // Then, apply the focus styles to the slider track instead
          '[&_[data-slot=slider-track]]:transition-[box-shadow]',
          '[&:focus-within_[data-slot=slider-track]]:ring-2',
          '[&:focus-within_[data-slot=slider-track]]:ring-ring',

          // Make the slider track appear clickable,
          // but non-clickable when the slider is disabled.
          '[&_[data-slot=slider-track]]:cursor-pointer',
          '[&_[data-slot=slider-track]]:data-[disabled]:cursor-not-allowed',
          '[&_[data-slot=slider-thumb]]:data-[disabled]:cursor-not-allowed',

          // Default styles
          '[&_[data-slot=slider-track]]:h-4.5',
          '[&_[data-slot=slider-track]]:bg-background',
        ],
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/**
 * Render the APG slider pattern. Arrow keys adjust by one step, while Home and
 * End move to the minimum and maximum values supplied to Radix.
 *
 * @public
 * @param properties - Radix slider properties and the Tau layout variant.
 * @returns The single- or multi-thumb slider.
 *
 * @example <caption>Control model opacity</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Slider } from '@taucad/ui/components/slider';
 *
 * export const example = createElement(Slider, { defaultValue: [50], 'aria-label': 'Opacity' });
 * ```
 */
function Slider({
  className,
  variant,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...properties
}: React.ComponentProps<typeof SliderPrimitive.Root> & VariantProps<typeof sliderVariants>): React.JSX.Element {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot='slider'
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(sliderVariants({ variant, className }))}
      {...properties}
    >
      <SliderPrimitive.Track
        data-slot='slider-track'
        className={cn(
          'relative grow overflow-hidden rounded-full border bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
        )}
      >
        <SliderPrimitive.Range
          data-slot='slider-range'
          className={cn('absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full')}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-slot='slider-thumb'
          className='block size-4 shrink-0 cursor-pointer rounded-full border border-primary bg-background shadow-sm ring-ring transition-[box-shadow] hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50'
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider, sliderVariants };
