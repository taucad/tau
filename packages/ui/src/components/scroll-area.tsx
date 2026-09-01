import * as React from 'react';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Provides a styled, keyboard-focusable viewport for overflowing content.
 *
 * @public
 * @example <caption>Render a bounded scroll area.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ScrollArea } from '@taucad/ui/components/scroll-area';
 *
 * createElement(ScrollArea, { className: 'h-48' }, 'Scrollable content');
 * ```
 */
function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>): React.JSX.Element {
  return (
    <ScrollAreaPrimitive.Root data-slot='scroll-area' className={cn('relative', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        data-slot='scroll-area-viewport'
        className='size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring'
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

/**
 * Renders an accessible vertical or horizontal scroll-area control.
 *
 * @public
 * @example <caption>Render a horizontal scrollbar.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ScrollBar } from '@taucad/ui/components/scroll-area';
 *
 * createElement(ScrollBar, { orientation: 'horizontal' });
 * ```
 */
function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>): React.JSX.Element {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot='scroll-area-scrollbar'
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot='scroll-area-thumb'
        className='relative flex-1 rounded-full bg-border'
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
