import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/cn.js';

const switchVariants = cva(
  'peer data-[state=checked]:bg-primary inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        // Sizes are slightly larger than thumb to present an elegant, thin appearance
        sm: 'h-3.15 w-7',
        md: 'h-4.15 w-10',
        lg: 'h-5.15 w-13',
      },
      variant: {
        default: 'data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
        dropdown: 'data-[state=unchecked]:bg-muted-foreground! dark:data-[state=unchecked]:bg-muted-foreground/80',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  },
);

const thumbVariants = cva(
  'bg-background dark:data-[state=checked]:bg-background pointer-events-none block rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(50%+2px)] data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: {
        sm: 'h-3 w-4',
        md: 'h-4 w-6',
        lg: 'h-5 w-8',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

/**
 * Render the APG switch pattern. Space toggles the checked state; a visible label
 * or accessible name must explain the binary setting.
 *
 * @public
 * @param properties - Radix switch properties and Tau variants.
 * @returns The switch control.
 *
 * @example <caption>Toggle autosave</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Switch } from '@taucad/ui/components/switch';
 *
 * export const example = createElement(Switch, { 'aria-label': 'Autosave' });
 * ```
 */
function Switch({
  className,
  size,
  variant,
  ...properties
}: React.ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      className={cn(switchVariants({ size, variant, className }))}
      {...properties}
    >
      <SwitchPrimitive.Thumb data-slot='switch-thumb' className={cn(thumbVariants({ size }))} />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
