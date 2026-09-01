import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '#utils/cn.js';
import { Separator } from '#components/separator.js';

/**
 * Build orientation-aware classes for attached controls.
 *
 * @public
 *
 * @example <caption>Style a vertical button group</caption>
 * ```typescript
 * import { buttonGroupVariants } from '@taucad/ui/components/button-group';
 *
 * export const className = buttonGroupVariants({ orientation: 'vertical' });
 * ```
 */
const buttonGroupVariants = cva(
  "has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg flex w-fit items-stretch *:focus-visible:z-10 *:focus-visible:relative [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          '[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
        vertical:
          '[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
    },
  },
);

/**
 * Group related controls under native `group` semantics. Each child keeps its
 * own keyboard contract; Tab moves among focusable controls.
 *
 * @public
 * @param properties - Group properties and orientation.
 * @returns The grouped-control container.
 *
 * @example <caption>Group related buttons</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ButtonGroup } from '@taucad/ui/components/button-group';
 *
 * export const example = createElement(ButtonGroup, { 'aria-label': 'View options' });
 * ```
 */
function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof buttonGroupVariants>): React.JSX.Element {
  return (
    <div
      role='group'
      data-slot='button-group'
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

/**
 * Render non-interactive text aligned with controls in a button group.
 *
 * @public
 * @param properties - Div properties and optional slot composition.
 * @returns The grouped text slot.
 *
 * @example <caption>Add a unit label</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ButtonGroupText } from '@taucad/ui/components/button-group';
 *
 * export const example = createElement(ButtonGroupText, null, 'mm');
 * ```
 */
function ButtonGroupText({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & {
  readonly asChild?: boolean;
}): React.JSX.Element {
  const Comp = asChild ? Slot.Root : 'div';

  return (
    <Comp
      data-slot='button-group-text'
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-muted px-2.5 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Visually separate controls inside a button group.
 *
 * @public
 * @param properties - Separator properties.
 * @returns The decorative separator.
 *
 * @example <caption>Separate grouped buttons</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ButtonGroupSeparator } from '@taucad/ui/components/button-group';
 *
 * export const example = createElement(ButtonGroupSeparator);
 * ```
 */
function ButtonGroupSeparator({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof Separator>): React.JSX.Element {
  return (
    <Separator
      data-slot='button-group-separator'
      orientation={orientation}
      className={cn(
        'relative self-stretch bg-input data-horizontal:mx-px data-horizontal:w-auto data-vertical:my-px data-vertical:h-auto',
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
