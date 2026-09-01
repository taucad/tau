import * as React from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/cn.js';

/**
 * Build class names for semantic badge variants.
 *
 * @public
 *
 * @example <caption>Style a secondary badge</caption>
 * ```typescript
 * import { badgeVariants } from '@taucad/ui/components/badge';
 *
 * export const className = badgeVariants({ variant: 'secondary' });
 * ```
 */
const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive: 'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 dark:bg-destructive/70',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/**
 * Render a compact status label. No APG pattern applies because badges are
 * non-interactive; slotted interactive children retain their native semantics.
 *
 * @public
 * @param properties - Span properties and the visual badge variant.
 * @returns The badge or slotted child.
 *
 * @example <caption>Label a beta feature</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Badge } from '@taucad/ui/components/badge';
 *
 * export const example = createElement(Badge, { variant: 'secondary' }, 'Beta');
 * ```
 */
function Badge({
  className,
  variant,
  asChild = false,
  ...properties
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { readonly asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'span';

  return <Comp data-slot='badge' className={cn(badgeVariants({ variant }), className)} {...properties} />;
}

export { Badge, badgeVariants };
