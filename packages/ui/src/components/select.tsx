import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { menuItemVariants, menuLabelVariants, menuSeparatorVariants } from '#components/menu.variants.js';
import { selectControlVariants, selectContentVariants } from '#components/select.variants.js';
import type { SelectSize } from '#components/select.variants.js';
import { useFullscreenElement } from '#hooks/use-fullscreen-element.js';

const SelectSizeContext = React.createContext<SelectSize>('default');

/**
 * Owns the selected value, open state, and keyboard interaction for a select.
 *
 * @public
 * @example <caption>Control a select value.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Select } from '@taucad/ui/components/select';
 *
 * createElement(Select, { value: 'metric' });
 * ```
 */
function Select({
  size = 'default',
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Root> & {
  readonly size?: SelectSize;
}): React.JSX.Element {
  return (
    <SelectSizeContext.Provider value={size}>
      <SelectPrimitive.Root data-slot='select' {...properties} />
    </SelectSizeContext.Provider>
  );
}

/**
 * Groups related select items under an optional label.
 *
 * @public
 * @example <caption>Render a select group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectGroup } from '@taucad/ui/components/select';
 *
 * createElement(SelectGroup);
 * ```
 */
function SelectGroup({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Group>): React.JSX.Element {
  return (
    <SelectPrimitive.Group
      data-slot='select-group'
      className={cn('flex scroll-my-1 flex-col gap-0.5', className)}
      {...properties}
    />
  );
}

/**
 * Displays the selected value or a placeholder inside a select trigger.
 *
 * @public
 * @example <caption>Render a select placeholder.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectValue } from '@taucad/ui/components/select';
 *
 * createElement(SelectValue, { placeholder: 'Choose units' });
 * ```
 */
function SelectValue({ ...properties }: React.ComponentProps<typeof SelectPrimitive.Value>): React.JSX.Element {
  return <SelectPrimitive.Value data-slot='select-value' {...properties} />;
}

/**
 * Opens the select list and displays its current value.
 *
 * @public
 * @example <caption>Render a small select trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Select, SelectTrigger } from '@taucad/ui/components/select';
 *
 * createElement(Select, { size: 'sm' }, createElement(SelectTrigger));
 * ```
 */
function SelectTrigger({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Trigger>): React.JSX.Element {
  const size = React.useContext(SelectSizeContext);
  return (
    <SelectPrimitive.Trigger
      data-slot='select-trigger'
      data-size={size}
      className={cn(selectControlVariants({ size, part: 'trigger' }), className)}
      {...properties}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className='pointer-events-none size-4 text-muted-foreground' />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * Renders the portaled, scrollable list of select options.
 *
 * @public
 * @example <caption>Render popper-positioned select content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectContent } from '@taucad/ui/components/select';
 *
 * createElement(SelectContent, { position: 'popper' });
 * ```
 */
function SelectContent({
  className,
  children,
  position = 'item-aligned',
  align = 'center',
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Content>): React.JSX.Element {
  const fullscreenElement = useFullscreenElement();
  return (
    <SelectPrimitive.Portal container={fullscreenElement}>
      <SelectPrimitive.Content
        data-slot='select-content'
        data-align-trigger={position === 'item-aligned'}
        className={cn(selectContentVariants({ position }), className)}
        position={position}
        align={align}
        {...properties}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            'flex flex-col gap-0.5 p-(--select-gutter)',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

/**
 * Labels a group of select options.
 *
 * @public
 * @example <caption>Render a select group label.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectLabel } from '@taucad/ui/components/select';
 *
 * createElement(SelectLabel, null, 'Units');
 * ```
 */
function SelectLabel({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Label>): React.JSX.Element {
  return (
    <SelectPrimitive.Label data-slot='select-label' className={cn(menuLabelVariants(), className)} {...properties} />
  );
}

/**
 * Represents one selectable option.
 *
 * @public
 * @example <caption>Render a select option.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectItem } from '@taucad/ui/components/select';
 *
 * createElement(SelectItem, { value: 'metric' }, 'Metric');
 * ```
 */
function SelectItem({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Item>): React.JSX.Element {
  const size = React.useContext(SelectSizeContext);
  return (
    <SelectPrimitive.Item
      data-slot='select-item'
      className={cn(menuItemVariants(), selectControlVariants({ size, part: 'item' }), className)}
      {...properties}
    >
      <span className='pointer-events-none col-start-2 row-start-1 flex size-4 items-center justify-center'>
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className='pointer-events-none size-4' />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/**
 * Visually separates select-option groups.
 *
 * @public
 * @example <caption>Render a select separator.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectSeparator } from '@taucad/ui/components/select';
 *
 * createElement(SelectSeparator);
 * ```
 */
function SelectSeparator({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.Separator>): React.JSX.Element {
  return (
    <SelectPrimitive.Separator
      data-slot='select-separator'
      className={cn(menuSeparatorVariants(), 'pointer-events-none', className)}
      {...properties}
    />
  );
}

/**
 * Scrolls overflowing select content upward while pressed or hovered.
 *
 * @public
 * @example <caption>Render the select scroll-up control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectScrollUpButton } from '@taucad/ui/components/select';
 *
 * createElement(SelectScrollUpButton);
 * ```
 */
function SelectScrollUpButton({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>): React.JSX.Element {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot='select-scroll-up-button'
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...properties}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpButton>
  );
}

/**
 * Scrolls overflowing select content downward while pressed or hovered.
 *
 * @public
 * @example <caption>Render the select scroll-down control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SelectScrollDownButton } from '@taucad/ui/components/select';
 *
 * createElement(SelectScrollDownButton);
 * ```
 */
function SelectScrollDownButton({
  className,
  ...properties
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>): React.JSX.Element {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot='select-scroll-down-button'
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...properties}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
