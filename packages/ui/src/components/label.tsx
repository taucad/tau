import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Associate visible text with a form control. No separate APG pattern applies;
 * clicking the label focuses or activates its labelled control.
 *
 * @public
 * @param properties - Radix label properties.
 * @returns The label element.
 *
 * @example <caption>Label a form field</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Label } from '@taucad/ui/components/label';
 *
 * export const example = createElement(Label, { htmlFor: 'model-name' }, 'Model name');
 * ```
 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element {
  return (
    <LabelPrimitive.Root
      data-slot='label'
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
