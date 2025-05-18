import * as React from 'react';
import { cn } from '~/utils/ui.js';

function Input({ className, type, ...properties }: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
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
