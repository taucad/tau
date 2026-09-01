import * as React from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/cn.js';

/**
 * Build class names for Tau button variants and sizes.
 *
 * @public
 *
 * @example <caption>Style a compact outline button</caption>
 * ```typescript
 * import { buttonVariants } from '@taucad/ui/components/button';
 *
 * export const className = buttonVariants({ variant: 'outline', size: 'sm' });
 * ```
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[box-shadow,transform] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive max-md:active:scale-105 select-none active:opacity-80",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/60',
        // A variant of the outline, used when overlaying onto a canvas
        overlay: 'border bg-sidebar shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary border text-secondary-foreground shadow-xs hover:bg-secondary/80',
        neutral: 'bg-accent/70 text-foreground shadow-xs hover:bg-accent',
        ghost: 'hover:bg-accent/50 hover:text-accent-foreground dark:hover:bg-accent/80',
        link: 'underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-4 py-2 has-[>svg]:px-3',
        xs: 'h-6 rounded-md gap-1.5 px-2 has-[>svg]:px-2 text-xs',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs',
        lg: 'h-10 rounded-md px-8 has-[>svg]:px-4',
        icon: 'size-8',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Render a native button or slot. Enter and Space activate native buttons;
 * consumers must preserve equivalent semantics when using `asChild`.
 *
 * @public
 * @param properties - Button properties and Tau variants.
 * @returns The button or slotted child.
 *
 * @example <caption>Create a primary action</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Button } from '@taucad/ui/components/button';
 *
 * export const example = createElement(Button, null, 'Save model');
 * ```
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...properties
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
  }): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';

  return <Comp data-slot='button' className={cn(buttonVariants({ variant, size, className }))} {...properties} />;
}

export { Button, buttonVariants };
