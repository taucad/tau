import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { CircleIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';

/**
 * Render the APG radio-group pattern. Arrow keys move and select within the group;
 * Tab enters or leaves the group as one stop.
 *
 * @public
 * @param properties - Radix radio-group root properties.
 * @returns The radio group.
 *
 * @example <caption>Create an orientation selector</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { RadioGroup } from '@taucad/ui/components/radio-group';
 *
 * export const example = createElement(RadioGroup, { 'aria-label': 'Orientation', defaultValue: 'horizontal' });
 * ```
 */
function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>): React.JSX.Element {
  return <RadioGroupPrimitive.Root data-slot='radio-group' className={cn('grid gap-3', className)} {...props} />;
}

/**
 * Render one labelled choice within a radio group.
 *
 * @public
 * @param properties - Radix radio item properties.
 * @returns The radio item.
 *
 * @example <caption>Add a radio choice</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { RadioGroupItem } from '@taucad/ui/components/radio-group';
 *
 * export const example = createElement(RadioGroupItem, { value: 'horizontal', 'aria-label': 'Horizontal' });
 * ```
 */
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>): React.JSX.Element {
  return (
    <RadioGroupPrimitive.Item
      data-slot='radio-group-item'
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot='radio-group-indicator'
        className='relative flex items-center justify-center'
      >
        <CircleIcon className='absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary' />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
