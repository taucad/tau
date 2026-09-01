import * as React from 'react';
import { Toggle as TogglePrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/cn.js';

/**
 * Build class names for toggle-button variants and sizes.
 *
 * @public
 *
 * @example <caption>Style an outlined toggle</caption>
 * ```typescript
 * import { toggleVariants } from '@taucad/ui/components/toggle';
 *
 * export const className = toggleVariants({ variant: 'outline', size: 'sm' });
 * ```
 */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-menu-highlight hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-menu-highlight data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-ring outline-none transition-[color,box-shadow] aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent shadow-xs hover:bg-menu-highlight hover:text-foreground',
      },
      size: {
        default: 'h-9 px-2 min-w-9',
        sm: 'h-8 px-1.5 min-w-8',
        lg: 'h-10 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Render the APG toggle-button pattern. Space or Enter changes the pressed state,
 * which Radix exposes through `aria-pressed`.
 *
 * @public
 * @param properties - Radix toggle properties and Tau variants.
 * @returns The toggle button.
 *
 * @example <caption>Toggle grid visibility</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Toggle } from '@taucad/ui/components/toggle';
 *
 * export const example = createElement(Toggle, { 'aria-label': 'Show grid' });
 * ```
 */
function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>): React.JSX.Element {
  return (
    <TogglePrimitive.Root data-slot='toggle' className={cn(toggleVariants({ variant, size, className }))} {...props} />
  );
}

export { Toggle, toggleVariants };
