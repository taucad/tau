import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';
import {
  menuItemVariants,
  menuContentVariants,
  menuLabelVariants,
  menuSeparatorVariants,
  menuSubTriggerOpenClass,
  menuShortcutClass,
  subMenuSideAlignOffset,
} from '#components/menu.variants.js';

/**
 * Owns the open state and focus lifecycle for a context menu.
 *
 * @public
 * @example <caption>Create a context menu root.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenu } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenu);
 * ```
 */
function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>): React.JSX.Element {
  return <ContextMenuPrimitive.Root data-slot='context-menu' {...props} />;
}

/**
 * Defines the region that opens a context menu on right-click or long press.
 *
 * @public
 * @example <caption>Render a context-menu target.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuTrigger } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuTrigger, null, 'Right-click here');
 * ```
 */
function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>): React.JSX.Element {
  return <ContextMenuPrimitive.Trigger data-slot='context-menu-trigger' {...props} />;
}

/**
 * Groups related context-menu items.
 *
 * @public
 * @example <caption>Render a context-menu group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuGroup } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuGroup);
 * ```
 */
function ContextMenuGroup({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Group
      data-slot='context-menu-group'
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    />
  );
}

/**
 * Portals context-menu content into the document body.
 *
 * @public
 * @example <caption>Render content through a context-menu portal.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuPortal } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuPortal, null, createElement('div'));
 * ```
 */
function ContextMenuPortal({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Portal>): React.JSX.Element {
  return <ContextMenuPrimitive.Portal data-slot='context-menu-portal' {...props} />;
}

/**
 * Owns the open state for a nested context-menu branch.
 *
 * @public
 * @example <caption>Create a nested context menu.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuSub } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuSub);
 * ```
 */
function ContextMenuSub({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>): React.JSX.Element {
  return <ContextMenuPrimitive.Sub data-slot='context-menu-sub' {...props} />;
}

/**
 * Coordinates a mutually exclusive set of context-menu radio items.
 *
 * @public
 * @example <caption>Control a context-menu radio group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuRadioGroup } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuRadioGroup, { value: 'compact' });
 * ```
 */
function ContextMenuRadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot='context-menu-radio-group'
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    />
  );
}

/**
 * Opens a nested context menu when highlighted or activated.
 *
 * @public
 * @example <caption>Render a nested-menu trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuSubTrigger } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuSubTrigger, null, 'More');
 * ```
 */
function ContextMenuSubTrigger({
  className,
  isInset,
  // oxlint-disable-next-line typescript/no-deprecated -- Reads the compatibility alias.
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  readonly isInset?: boolean;
  /** @deprecated Use `isInset` instead. */
  // oxlint-disable-next-line react-js/boolean-prop-naming -- Compatibility alias for the stock shadcn API.
  readonly inset?: boolean;
}): React.JSX.Element {
  const shouldUseInset = isInset ?? inset;

  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot='context-menu-sub-trigger'
      data-inset={shouldUseInset}
      className={cn(menuItemVariants({ inset: shouldUseInset }), menuSubTriggerOpenClass, className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className='ml-auto size-3.5' />
    </ContextMenuPrimitive.SubTrigger>
  );
}

/**
 * Renders the positioned surface for a nested context menu.
 *
 * @public
 * @example <caption>Render nested context-menu content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuSubContent } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuSubContent);
 * ```
 */
function ContextMenuSubContent({
  className,
  alignOffset = subMenuSideAlignOffset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot='context-menu-sub-content'
      alignOffset={alignOffset}
      className={cn(
        menuContentVariants(),
        'shadow-lg origin-(--radix-context-menu-content-transform-origin)',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders the positioned context-menu surface.
 *
 * @public
 * @example <caption>Render context-menu content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuContent } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuContent);
 * ```
 */
function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot='context-menu-content'
        className={cn(
          menuContentVariants(),
          'max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

/**
 * Represents one selectable context-menu action.
 *
 * @public
 * @example <caption>Render a destructive context-menu item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuItem } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuItem, { variant: 'destructive' }, 'Delete');
 * ```
 */
function ContextMenuItem({
  className,
  isInset,
  // oxlint-disable-next-line typescript/no-deprecated -- Reads the compatibility alias.
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  readonly isInset?: boolean;
  /** @deprecated Use `isInset` instead. */
  // oxlint-disable-next-line react-js/boolean-prop-naming -- Compatibility alias for the stock shadcn API.
  readonly inset?: boolean;
  readonly variant?: 'default' | 'destructive';
}): React.JSX.Element {
  const shouldUseInset = isInset ?? inset;

  return (
    <ContextMenuPrimitive.Item
      data-slot='context-menu-item'
      data-inset={shouldUseInset}
      data-variant={variant}
      className={cn(menuItemVariants({ variant, inset: shouldUseInset }), className)}
      {...props}
    />
  );
}

/**
 * Represents a checkable context-menu option.
 *
 * @public
 * @example <caption>Render a checked context-menu option.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuCheckboxItem } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuCheckboxItem, { checked: true }, 'Grid');
 * ```
 */
function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot='context-menu-checkbox-item'
      className={cn(menuItemVariants({ inset: true }), 'pr-2', className)}
      checked={checked}
      {...props}
    >
      <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className='size-4' />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

/**
 * Represents one value in a context-menu radio group.
 *
 * @public
 * @example <caption>Render a context-menu radio item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuRadioItem } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuRadioItem, { value: 'compact' }, 'Compact');
 * ```
 */
function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot='context-menu-radio-item'
      className={cn(menuItemVariants({ inset: true }), 'pr-2', className)}
      {...props}
    >
      <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
        <ContextMenuPrimitive.ItemIndicator>
          <CircleIcon className='size-2 fill-current' />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

/**
 * Labels a group of context-menu items.
 *
 * @public
 * @example <caption>Render a context-menu label.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuLabel } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuLabel, null, 'View');
 * ```
 */
function ContextMenuLabel({
  className,
  isInset,
  // oxlint-disable-next-line typescript/no-deprecated -- Reads the compatibility alias.
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  readonly isInset?: boolean;
  /** @deprecated Use `isInset` instead. */
  // oxlint-disable-next-line react-js/boolean-prop-naming -- Compatibility alias for the stock shadcn API.
  readonly inset?: boolean;
}): React.JSX.Element {
  const shouldUseInset = isInset ?? inset;

  return (
    <ContextMenuPrimitive.Label
      data-slot='context-menu-label'
      data-inset={shouldUseInset}
      className={cn(menuLabelVariants({ inset: shouldUseInset }), className)}
      {...props}
    />
  );
}

/**
 * Visually separates context-menu groups.
 *
 * @public
 * @example <caption>Render a context-menu separator.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuSeparator } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuSeparator);
 * ```
 */
function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Separator
      data-slot='context-menu-separator'
      className={cn(menuSeparatorVariants(), className)}
      {...props}
    />
  );
}

/**
 * Displays a keyboard shortcut beside a context-menu item.
 *
 * @public
 * @example <caption>Show a context-menu shortcut.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ContextMenuShortcut } from '@taucad/ui/components/context-menu';
 *
 * createElement(ContextMenuShortcut, null, '⌘D');
 * ```
 */
function ContextMenuShortcut({ className, ...props }: React.ComponentProps<'span'>): React.JSX.Element {
  return <span data-slot='context-menu-shortcut' className={cn(menuShortcutClass, className)} {...props} />;
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
