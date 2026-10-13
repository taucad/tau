import type { ComponentProps } from 'react';
import { cn } from '#utils/cn.js';

/**
 * Render a short code span inside running text, such as a key, a path or a
 * parameter name.
 *
 * @public
 * @param properties - Native `code` element properties.
 * @returns The styled code span.
 *
 * @example <caption>Name a parameter in a sentence</caption>
 * ```tsx
 * import { InlineCode } from '@taucad/ui/components/inline-code';
 *
 * export const Hint = (): React.JSX.Element => (
 *   <p>
 *     Set <InlineCode>wallThickness</InlineCode> in millimetres.
 *   </p>
 * );
 * ```
 */
export function InlineCode({ children, className, ...rest }: ComponentProps<'code'>): React.JSX.Element {
  return (
    <code
      {...rest}
      data-slot='inline-code'
      className={cn(
        className,
        'rounded-xs border bg-neutral/10 px-1 py-0 font-normal text-foreground/80 before:content-none after:content-none',
      )}
    >
      {children}
    </code>
  );
}
