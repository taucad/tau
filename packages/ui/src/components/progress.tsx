import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Render the APG progressbar pattern. Assistive technology receives the current
 * value while the indicator supplies the visual fill; the control is not interactive.
 *
 * @public
 * @param properties - Radix progress properties.
 * @returns The progressbar.
 *
 * @example <caption>Report export progress</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Progress } from '@taucad/ui/components/progress';
 *
 * export const example = createElement(Progress, { value: 60, 'aria-label': 'Export progress' });
 * ```
 */
function Progress({
  className,
  value,
  ...properties
}: React.ComponentProps<typeof ProgressPrimitive.Root>): React.JSX.Element {
  return (
    <ProgressPrimitive.Root
      data-slot='progress'
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...properties}
    >
      <ProgressPrimitive.Indicator
        data-slot='progress-indicator'
        className='size-full flex-1 bg-primary transition-all'
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
