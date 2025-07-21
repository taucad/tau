import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '~/utils/ui.js';

function TooltipProvider({
  delayDuration = 0,
  ...properties
}: React.ComponentProps<typeof TooltipPrimitive.Provider>): React.JSX.Element {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...properties} />;
}

function Tooltip({ ...properties }: React.ComponentProps<typeof TooltipPrimitive.Root>): React.JSX.Element {
  return <TooltipPrimitive.Root data-slot="tooltip" {...properties} />;
}

function TooltipTrigger({ ...properties }: React.ComponentProps<typeof TooltipPrimitive.Trigger>): React.JSX.Element {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...properties} />;
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...properties
}: React.ComponentProps<typeof TooltipPrimitive.Content>): React.JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit rounded-md border border-black bg-black px-2 py-1 text-xs text-balance text-white dark:border-muted',
          className,
        )}
        {...properties}
      >
        {children}
        <TooltipPrimitive.Arrow className="size-2.5 translate-y-[calc(-50%_-_2px)] -rotate-45 rounded-[2px] border border-black bg-black fill-black [clip-path:polygon(0_1.5px,calc(100%-1.5px)_100%,0_100%)] dark:border-muted" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
