import * as React from 'react';
import { HoverCard as HoverCardPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

/**
 * Show supplementary, non-essential content on pointer hover or keyboard focus.
 * No APG pattern applies; interactive content must not be placed in the card.
 *
 * @public
 * @param properties - Radix hover-card root properties.
 * @returns The hover-card state root.
 *
 * @example <caption>Create a hover card</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { HoverCard } from '@taucad/ui/components/hover-card';
 *
 * export const example = createElement(HoverCard);
 * ```
 */
function HoverCard({ ...properties }: React.ComponentProps<typeof HoverCardPrimitive.Root>): React.JSX.Element {
  return <HoverCardPrimitive.Root openDelay={0} closeDelay={0} data-slot='hover-card' {...properties} />;
}

/**
 * Anchor a hover card to a focusable or pointer-accessible element.
 *
 * @public
 * @param properties - Radix hover-card trigger properties.
 * @returns The hover-card trigger.
 *
 * @example <caption>Add a hover-card trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { HoverCardTrigger } from '@taucad/ui/components/hover-card';
 *
 * export const example = createElement(HoverCardTrigger, null, 'Owner');
 * ```
 */
function HoverCardTrigger({
  ...properties
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>): React.JSX.Element {
  return <HoverCardPrimitive.Trigger data-slot='hover-card-trigger' {...properties} />;
}

/**
 * Render the portalled hover-card surface.
 *
 * @public
 * @param properties - Radix hover-card content properties.
 * @returns The hover-card content.
 *
 * @example <caption>Add hover-card content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { HoverCardContent } from '@taucad/ui/components/hover-card';
 *
 * export const example = createElement(HoverCardContent, null, 'Richard Fontein');
 * ```
 */
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

/**
 * Portal custom hover-card content to a chosen DOM container.
 *
 * @public
 * @param properties - Radix portal properties.
 * @returns The hover-card portal.
 *
 * @example <caption>Portal hover-card content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { HoverCardPortal } from '@taucad/ui/components/hover-card';
 *
 * export const example = createElement(HoverCardPortal, null, 'Details');
 * ```
 */
function HoverCardPortal({ ...properties }: React.ComponentProps<typeof HoverCardPrimitive.Portal>): React.JSX.Element {
  return <HoverCardPrimitive.Portal data-slot='hover-card-portal' {...properties} />;
}

export { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardPortal };
