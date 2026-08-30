import * as React from 'react';
import { HoverCard as HoverCardPrimitive } from 'radix-ui';
import { cn } from '#utils/ui.utils.js';
import { popoverSurfaceVariants } from '#components/ui/popover.variants.js';

function HoverCard({ ...properties }: React.ComponentProps<typeof HoverCardPrimitive.Root>): React.JSX.Element {
  return <HoverCardPrimitive.Root openDelay={0} closeDelay={0} data-slot='hover-card' {...properties} />;
}

function HoverCardTrigger({
  ...properties
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>): React.JSX.Element {
  return <HoverCardPrimitive.Trigger data-slot='hover-card-trigger' {...properties} />;
}

function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...properties
}: React.ComponentProps<typeof HoverCardPrimitive.Content>): React.JSX.Element {
  return (
    <HoverCardPrimitive.Portal data-slot='hover-card-portal'>
      <HoverCardPrimitive.Content
        data-slot='hover-card-content'
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverSurfaceVariants(), 'z-50 w-64 p-4', className)}
        {...properties}
      />
    </HoverCardPrimitive.Portal>
  );
}

function HoverCardPortal({ ...properties }: React.ComponentProps<typeof HoverCardPrimitive.Portal>): React.JSX.Element {
  return <HoverCardPrimitive.Portal data-slot='hover-card-portal' {...properties} />;
}

export { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardPortal };
