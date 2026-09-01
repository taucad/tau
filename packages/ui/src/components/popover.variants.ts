import { cva } from 'class-variance-authority';

/**
 * Build shared chrome for transient anchored and pointer-positioned surfaces.
 *
 * @public
 *
 * @example <caption>Style a menu surface</caption>
 * ```typescript
 * import { popoverSurfaceVariants } from '@taucad/ui/components/popover.variants';
 *
 * export const className = popoverSurfaceVariants({ appearance: 'menu' });
 * ```
 */
export const popoverSurfaceVariants = cva('rounded-md outline-hidden', {
  variants: {
    appearance: {
      panel: 'border bg-popover text-popover-foreground shadow-md',
      menu: 'border-0 bg-popover text-popover-foreground shadow-menu',
      picker: 'bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10',
      inverse: 'border border-black bg-black text-white dark:border-muted',
    },
  },
  defaultVariants: {
    appearance: 'panel',
  },
});
