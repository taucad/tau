import * as React from 'react';
import { Separator as SeparatorPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Render the APG separator pattern. It is decorative by default and therefore
 * omitted from the accessibility tree; set `decorative` to false for structure.
 *
 * @public
 * @param properties - Radix separator properties.
 * @returns The separator element.
 *
 * @example <caption>Separate two sections</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Separator } from '@taucad/ui/components/separator';
 *
 * export const example = createElement(Separator, { decorative: false });
 * ```
 */
function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...properties
}: React.ComponentProps<typeof SeparatorPrimitive.Root>): React.JSX.Element {
  return (
    <SeparatorPrimitive.Root
      data-slot='separator-root'
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...properties}
    />
  );
}

export { Separator };
