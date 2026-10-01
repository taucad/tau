import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

/** Shared geometry for the trigger and the row that replaces it when opening. */
export const selectControlVariants = cva(
  "grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-1.5 rounded-md border py-1 pr-2 pl-2.5 text-sm whitespace-nowrap outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:translate-y-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
  {
    variants: {
      size: { default: 'h-9', sm: 'h-7' },
      part: {
        trigger:
          'w-fit border-input bg-transparent transition-colors focus-visible:focus-outline disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[placeholder]:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50',
        item: 'w-full min-w-0 border-transparent *:[span]:last:col-start-1 *:[span]:last:row-start-1 *:[span]:last:flex *:[span]:last:min-w-0 *:[span]:last:items-center *:[span]:last:gap-2 *:[span]:last:truncate',
      },
    },
    defaultVariants: { size: 'default', part: 'trigger' },
  },
);

/** A declared size shared across the trigger and portaled options. */
export type SelectSize = NonNullable<VariantProps<typeof selectControlVariants>['size']>;

/** Radix owns placement and wrapper width; CSS prevents option text widening it. */
export const selectContentVariants = cva(
  [
    popoverSurfaceVariants({ appearance: 'picker' }),
    'relative z-50 min-w-0 overflow-x-hidden overflow-y-auto [--select-gutter:var(--spacing)]',
  ],
  {
    variants: {
      position: {
        // Radix's minimum wrapper width includes one gutter; content adds the other.
        'item-aligned':
          'w-[calc(100%+var(--select-gutter))] [contain:inline-size] [align-self:self-start] animate-none',
        popper:
          'max-h-(--radix-select-content-available-height) w-[calc(var(--radix-select-trigger-width)+var(--select-gutter)*2)] origin-(--radix-select-content-transform-origin) duration-100 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
      },
    },
    defaultVariants: { position: 'item-aligned' },
  },
);
