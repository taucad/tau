import * as React from 'react';
import { cn } from '#utils/ui.utils.js';

function Textarea({ className, ...properties }: React.ComponentProps<'textarea'>): React.JSX.Element {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30',
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

export { Textarea };
