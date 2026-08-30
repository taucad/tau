import * as React from 'react';
import { Popover as PopoverPrimitive, Slot as SlotPrimitive } from 'radix-ui';
import { cn } from '#utils/ui.utils.js';
import { popoverSurfaceVariants } from '#components/ui/popover.variants.js';

function Popover({ ...properties }: React.ComponentProps<typeof PopoverPrimitive.Root>): React.JSX.Element {
  return <PopoverPrimitive.Root data-slot='popover' {...properties} />;
}

function PopoverTrigger({ ...properties }: React.ComponentProps<typeof PopoverPrimitive.Trigger>): React.JSX.Element {
  return <PopoverPrimitive.Trigger data-slot='popover-trigger' {...properties} />;
}

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

function PopoverAnchor({ ...properties }: React.ComponentProps<typeof PopoverPrimitive.Anchor>): React.JSX.Element {
  return <PopoverPrimitive.Anchor data-slot='popover-anchor' {...properties} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
