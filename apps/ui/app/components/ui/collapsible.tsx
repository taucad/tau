import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

function Collapsible({ ...properties }: React.ComponentProps<typeof CollapsiblePrimitive.Root>): React.JSX.Element {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...properties} />;
}

function CollapsibleTrigger({
  ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>): React.JSX.Element {
  return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...properties} />;
}

function CollapsibleContent({
  ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>): React.JSX.Element {
  return <CollapsiblePrimitive.CollapsibleContent data-slot="collapsible-content" {...properties} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
