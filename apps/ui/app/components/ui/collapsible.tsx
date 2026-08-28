import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { cn } from '#utils/ui.utils.js';

function Collapsible({ ...properties }: React.ComponentProps<typeof CollapsiblePrimitive.Root>): React.JSX.Element {
  return <CollapsiblePrimitive.Root data-slot='collapsible' {...properties} />;
}

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
