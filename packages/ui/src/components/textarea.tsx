import * as React from 'react';
import { cn } from '#utils/cn.js';

/**
 * Render a native multiline text field with Tau focus and invalid states.
 * Native editing and keyboard behavior are preserved.
 *
 * @public
 * @param properties - Standard textarea properties.
 * @returns The native textarea.
 *
 * @example <caption>Create a description field</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Textarea } from '@taucad/ui/components/textarea';
 *
 * export const example = createElement(Textarea, { name: 'description', 'aria-label': 'Description' });
 * ```
 */
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
