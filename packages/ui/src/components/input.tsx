import * as React from 'react';
import { cn } from '#utils/cn.js';

/**
 * Render a native input with Tau focus, invalid, and disabled states. Keyboard
 * behavior follows the selected HTML input type.
 *
 * @public
 * @param properties - Standard input properties.
 * @returns The native input.
 *
 * @example <caption>Create a named text input</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Input } from '@taucad/ui/components/input';
 *
 * export const example = createElement(Input, { name: 'modelName', 'aria-label': 'Model name' });
 * ```
 */
function Input({ className, type, ...properties }: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        'flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-[box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:ring-2 focus-visible:ring-ring',
        'aria-invalid:border-destructive',
        type === 'number' && ['[&::-webkit-inner-spin-button]:appearance-none'],
        className,
      )}
      {...(properties.autoComplete === 'off'
        ? /* Disable auto-complete on password managers */
          {
            // 1Password
            /* autoComplete: 'off' - Already passed through, documented for completeness  */
            // LastPass
            'data-lpignore': 'true',
            // Dashlane
            'data-form-type': 'other',
          }
        : {})}
      {...properties}
    />
  );
}

export { Input };
