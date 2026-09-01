import * as React from 'react';
import { Popover as PopoverPrimitive, Slot as SlotPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

/**
 * Coordinate an anchored non-modal surface. No single APG pattern covers generic
 * popovers; the trigger and content must expose semantics for their actual task.
 * Escape closes the surface and focus returns to the trigger through Radix.
 *
 * @public
 * @param properties - Radix popover root properties.
 * @returns The popover state root.
 *
 * @example <caption>Create an anchored popover</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Popover } from '@taucad/ui/components/popover';
 *
 * export const example = createElement(Popover);
 * ```
 */
function Popover({ ...properties }: React.ComponentProps<typeof PopoverPrimitive.Root>): React.JSX.Element {
  return <PopoverPrimitive.Root data-slot='popover' {...properties} />;
}

/**
 * Render the control that opens and closes a popover.
 *
 * @public
 * @param properties - Radix popover-trigger properties.
 * @returns The popover trigger.
 *
 * @example <caption>Add a popover trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { PopoverTrigger } from '@taucad/ui/components/popover';
 *
 * export const example = createElement(PopoverTrigger, null, 'Edit');
 * ```
 */
function PopoverTrigger({ ...properties }: React.ComponentProps<typeof PopoverPrimitive.Trigger>): React.JSX.Element {
  return <PopoverPrimitive.Trigger data-slot='popover-trigger' {...properties} />;
}

/**
 * Render the Tau popover surface, portalled by default.
 *
 * @public
 * @param properties - Radix content properties and portal selection.
 * @returns The popover content.
 *
 * @example <caption>Add popover content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { PopoverContent } from '@taucad/ui/components/popover';
 *
 * export const example = createElement(PopoverContent, null, 'Edit parameters');
 * ```
 */
function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  withPortal = true,
  ...properties
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /**
   * Whether to use a portal for the popover content.
   * If true, the popover content will be rendered in a portal.
   * If false, the popover content will be rendered in the same document.
   *
   * `true` is useful to keep the popover content css cascade isolated from the parent.
   * `false` is useful to apply child-level css to the popover content.
   *
   * @default true
   */
  readonly withPortal?: boolean;
}): React.JSX.Element {
  const Component = withPortal ? PopoverPrimitive.Portal : SlotPrimitive.Slot;

  return (
    <Component>
      <PopoverPrimitive.Content
        data-slot='popover-content'
        align={align}
        sideOffset={sideOffset}
        className={cn(
          popoverSurfaceVariants(),
          'z-50 w-72 origin-(--radix-popover-content-transform-origin) p-4',
          className,
        )}
        {...properties}
      />
    </Component>
  );
}

/**
 * Position popover content relative to a custom anchor.
 *
 * @public
 * @param properties - Radix popover-anchor properties.
 * @returns The popover anchor.
 *
 * @example <caption>Add a custom anchor</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { PopoverAnchor } from '@taucad/ui/components/popover';
 *
 * export const example = createElement(PopoverAnchor, null, 'Anchor');
 * ```
 */
function PopoverAnchor({ ...properties }: React.ComponentProps<typeof PopoverPrimitive.Anchor>): React.JSX.Element {
  return <PopoverPrimitive.Anchor data-slot='popover-anchor' {...properties} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
