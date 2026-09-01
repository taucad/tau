import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

/**
 * Configure timing for descendants implementing the APG tooltip pattern.
 * Tooltips appear on hover or focus and dismiss on Escape; they never receive focus.
 *
 * @public
 * @param properties - Radix tooltip-provider properties.
 * @returns The tooltip provider.
 *
 * @example <caption>Provide instant tooltips</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TooltipProvider } from '@taucad/ui/components/tooltip';
 *
 * export const example = createElement(TooltipProvider, null, 'Application');
 * ```
 */
function TooltipProvider({
  delayDuration = 0,
  disableHoverableContent = true,
  ...properties
}: React.ComponentProps<typeof TooltipPrimitive.Provider>): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider
      data-slot='tooltip-provider'
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      {...properties}
    />
  );
}

/**
 * Coordinate one trigger and tooltip content pair.
 *
 * @public
 * @param properties - Radix tooltip root properties.
 * @returns The tooltip state root.
 *
 * @example <caption>Create a tooltip</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Tooltip } from '@taucad/ui/components/tooltip';
 *
 * export const example = createElement(Tooltip);
 * ```
 */
function Tooltip({ ...properties }: React.ComponentProps<typeof TooltipPrimitive.Root>): React.JSX.Element {
  return <TooltipPrimitive.Root data-slot='tooltip' {...properties} />;
}

/**
 * Attach a tooltip description to a focusable trigger.
 *
 * @public
 * @param properties - Radix tooltip-trigger properties.
 * @returns The tooltip trigger.
 *
 * @example <caption>Add a tooltip trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TooltipTrigger } from '@taucad/ui/components/tooltip';
 *
 * export const example = createElement(TooltipTrigger, null, 'Export');
 * ```
 */
function TooltipTrigger({ ...properties }: React.ComponentProps<typeof TooltipPrimitive.Trigger>): React.JSX.Element {
  return <TooltipPrimitive.Trigger data-slot='tooltip-trigger' {...properties} />;
}

/**
 * Render the portalled tooltip description.
 *
 * @public
 * @param properties - Radix tooltip-content properties.
 * @returns The tooltip content and arrow.
 *
 * @example <caption>Describe a control</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { TooltipContent } from '@taucad/ui/components/tooltip';
 *
 * export const example = createElement(TooltipContent, null, 'Export model');
 * ```
 */
function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...properties
}: React.ComponentProps<typeof TooltipPrimitive.Content>): React.JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot='tooltip-content'
        sideOffset={sideOffset}
        className={cn(
          popoverSurfaceVariants({ appearance: 'inverse' }),
          'z-50 w-fit px-2 py-1 text-xs text-balance select-none',
          className,
        )}
        {...properties}
      >
        {children}
        <TooltipPrimitive.Arrow className='size-2.5 translate-y-[calc(-50%-2px)] -rotate-45 rounded-[2px] border border-black bg-black fill-black [clip-path:polygon(0_1.5px,calc(100%-1.5px)_100%,0_100%)] dark:border-muted' />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
