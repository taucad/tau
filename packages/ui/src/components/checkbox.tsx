import * as React from 'react';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Properties for the Tau checkbox primitive.
 *
 * @public
 *
 * @example <caption>Configure a labelled checkbox</caption>
 * ```typescript
 * import type { CheckboxProps } from '@taucad/ui/components/checkbox';
 *
 * const properties: CheckboxProps = { 'aria-label': 'Include hidden files' };
 * ```
 */
type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  readonly size?: 'default' | 'large';
};

/**
 * Render an accessible checkbox with Tau sizing and state styles.
 *
 * @public
 * @param properties - Radix checkbox properties and the Tau size variant.
 * @returns The checkbox control.
 *
 * @example <caption>Toggle an option</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Checkbox } from '@taucad/ui/components/checkbox';
 *
 * export const example = createElement(Checkbox, { 'aria-label': 'Include hidden files' });
 * ```
 */
function Checkbox({ className, size = 'default', ...properties }: CheckboxProps): React.JSX.Element {
  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(
        'peer flex shrink-0 items-center justify-center bg-input transition-colors duration-500 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        size === 'default' ? 'size-4 rounded-sm' : 'size-8 rounded-md',
        className,
      )}
      {...properties}
    >
      <CheckboxPrimitive.Indicator data-slot='checkbox-indicator'>
        <CheckIcon className={cn(size === 'default' ? 'size-3' : 'size-6')} strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox, type CheckboxProps };
