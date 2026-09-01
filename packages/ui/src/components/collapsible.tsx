import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Render the APG disclosure pattern. Space or Enter on its trigger toggles the
 * controlled content and updates `aria-expanded`.
 *
 * @public
 * @param properties - Radix collapsible root properties.
 * @returns The collapsible state root.
 *
 * @example <caption>Create a disclosure</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Collapsible } from '@taucad/ui/components/collapsible';
 *
 * export const example = createElement(Collapsible, { defaultOpen: true });
 * ```
 */
function Collapsible({ ...properties }: React.ComponentProps<typeof CollapsiblePrimitive.Root>): React.JSX.Element {
  return <CollapsiblePrimitive.Root data-slot='collapsible' {...properties} />;
}

/**
 * Render the button that toggles collapsible content.
 *
 * @public
 * @param properties - Radix disclosure-trigger properties.
 * @returns The disclosure trigger.
 *
 * @example <caption>Add a disclosure trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CollapsibleTrigger } from '@taucad/ui/components/collapsible';
 *
 * export const example = createElement(CollapsibleTrigger, null, 'Details');
 * ```
 */
function CollapsibleTrigger({
  className,
  ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>): React.JSX.Element {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot='collapsible-trigger'
      className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      {...properties}
    />
  );
}

/**
 * Render content whose visibility is controlled by the disclosure root.
 *
 * @public
 * @param properties - Radix disclosure-content properties.
 * @returns The disclosure content.
 *
 * @example <caption>Add disclosure content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CollapsibleContent } from '@taucad/ui/components/collapsible';
 *
 * export const example = createElement(CollapsibleContent, null, 'Model details');
 * ```
 */
function CollapsibleContent({
  className,
  forceMount,
  ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>): React.JSX.Element {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      className={cn(
        // When forceMount is true, use CSS to hide instead of unmounting
        forceMount && 'data-[state=closed]:hidden',
        className,
      )}
      data-slot='collapsible-content'
      forceMount={forceMount ? true : undefined}
      {...properties}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
