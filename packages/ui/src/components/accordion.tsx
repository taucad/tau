import * as React from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cn } from '#utils/cn.js';

/**
 * Render the APG accordion pattern. Enter or Space toggles a header; Arrow keys,
 * Home, and End move focus between headers according to Radix's contract.
 *
 * @public
 * @param properties - Radix accordion root properties.
 * @returns The accordion root.
 *
 * @example <caption>Create a single-open accordion</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Accordion } from '@taucad/ui/components/accordion';
 *
 * export const example = createElement(Accordion, { type: 'single', collapsible: true });
 * ```
 */
function Accordion(properties: React.ComponentProps<typeof AccordionPrimitive.Root>): React.JSX.Element {
  return <AccordionPrimitive.Root data-slot='accordion' {...properties} />;
}

/**
 * Group one accordion header and panel under a stable value.
 *
 * @public
 *
 * @example <caption>Add an accordion item</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AccordionItem } from '@taucad/ui/components/accordion';
 *
 * export const example = createElement(AccordionItem, { value: 'geometry' });
 * ```
 */
const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} data-slot='accordion-item' className={cn('border-b', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

/**
 * Render an accordion heading button and disclosure indicator.
 *
 * @public
 *
 * @example <caption>Add an accordion trigger</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AccordionTrigger } from '@taucad/ui/components/accordion';
 *
 * export const example = createElement(AccordionTrigger, null, 'Geometry');
 * ```
 */
const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header data-slot='accordion-header' className='flex'>
    <AccordionPrimitive.Trigger
      ref={ref}
      data-slot='accordion-trigger'
      className={cn(
        'flex flex-1 items-center justify-between py-4 text-left text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200' />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

/**
 * Render the panel controlled by an accordion trigger.
 *
 * @public
 *
 * @example <caption>Add accordion content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AccordionContent } from '@taucad/ui/components/accordion';
 *
 * export const example = createElement(AccordionContent, null, 'Geometry settings');
 * ```
 */
const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    data-slot='accordion-content'
    className='overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down'
    {...props}
  >
    <div className={cn('pt-0 pb-4', className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
