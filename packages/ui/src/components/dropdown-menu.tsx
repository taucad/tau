import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { Switch } from '#components/switch.js';
import { ToggleGroup, ToggleGroupItem } from '#components/toggle-group.js';
import {
  menuItemVariants,
  menuContentVariants,
  menuLabelVariants,
  menuSeparatorVariants,
  menuSubTriggerOpenClass,
  menuShortcutClass,
  menuSideAlignOffset,
  subMenuSideAlignOffset,
  menuItemLayoutClass,
  menuItemIconClass,
} from '#components/menu.variants.js';

/**
 * Owns the open state and focus lifecycle for a dropdown menu.
 *
 * @public
 * @example <caption>Open a dropdown menu by default.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenu } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenu, { defaultOpen: true });
 * ```
 */
function DropdownMenu({ ...properties }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>): React.JSX.Element {
  return <DropdownMenuPrimitive.Root data-slot='dropdown-menu' {...properties} />;
}

/**
 * Portals dropdown-menu content into the document body.
 *
 * @public
 * @example <caption>Render content through a dropdown portal.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuPortal } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuPortal, null, createElement('div'));
 * ```
 */
function DropdownMenuPortal({
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>): React.JSX.Element {
  return <DropdownMenuPrimitive.Portal data-slot='dropdown-menu-portal' {...properties} />;
}

/**
 * Opens the nearest dropdown menu when activated.
 *
 * @public
 * @example <caption>Render a dropdown trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuTrigger } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuTrigger, null, 'Options');
 * ```
 */
function DropdownMenuTrigger({
  className,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot='dropdown-menu-trigger'
      className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      {...properties}
    />
  );
}

/**
 * Renders the positioned dropdown-menu surface.
 *
 * @public
 * @example <caption>Render dropdown content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuContent } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuContent, { side: 'bottom' });
 * ```
 */
function DropdownMenuContent({
  className,
  sideOffset = 4,
  side,
  alignOffset,
  onClick,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>): React.JSX.Element {
  const resolvedAlignOffset = alignOffset ?? (side === 'left' || side === 'right' ? menuSideAlignOffset : undefined);

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot='dropdown-menu-content'
        sideOffset={sideOffset}
        side={side}
        alignOffset={resolvedAlignOffset}
        className={cn(
          menuContentVariants(),
          'max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
          className,
        )}
        {...properties}
        onClick={(event: React.MouseEvent<HTMLDivElement>) => {
          // Prevent clicks inside portaled dropdown content from bubbling to
          // ancestor DrawerHandle elements, which would cycle snap points via
          // vaul's handleStartCycle.
          event.stopPropagation();
          onClick?.(event);
        }}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/**
 * Groups related dropdown-menu items.
 *
 * @public
 * @example <caption>Render a menu group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuGroup } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuGroup);
 * ```
 */
function DropdownMenuGroup({
  className,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Group
      data-slot='dropdown-menu-group'
      className={cn('flex flex-col gap-0.5', className)}
      {...properties}
    />
  );
}

/**
 * Represents one selectable dropdown-menu action.
 *
 * @public
 * @example <caption>Render a destructive menu item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuItem, { variant: 'destructive' }, 'Delete');
 * ```
 */
function DropdownMenuItem({
  className,
  isInset,
  variant = 'default',
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  readonly isInset?: boolean;
  readonly variant?: 'default' | 'destructive';
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-item'
      data-inset={isInset}
      data-variant={variant}
      className={cn(menuItemVariants({ variant, inset: isInset }), className)}
      {...properties}
    />
  );
}

/**
 * Represents a checkable dropdown-menu option.
 *
 * @public
 * @example <caption>Render a checked menu option.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuCheckboxItem } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuCheckboxItem, { checked: true }, 'Grid');
 * ```
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot='dropdown-menu-checkbox-item'
      className={cn(menuItemVariants({ inset: true }), 'pr-2', className)}
      checked={checked}
      {...properties}
    >
      <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className='size-4' />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

/**
 * Coordinates a mutually exclusive set of radio menu items.
 *
 * @public
 * @example <caption>Control a radio menu group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuRadioGroup } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuRadioGroup, { value: 'compact' });
 * ```
 */
function DropdownMenuRadioGroup({
  className,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot='dropdown-menu-radio-group'
      className={cn('flex flex-col gap-0.5', className)}
      {...properties}
    />
  );
}

/**
 * Represents one value in a dropdown radio group.
 *
 * @public
 * @example <caption>Render a radio menu item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuRadioItem } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuRadioItem, { value: 'compact' }, 'Compact');
 * ```
 */
function DropdownMenuRadioItem({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot='dropdown-menu-radio-item'
      className={cn(menuItemVariants({ inset: true }), 'pr-2', className)}
      {...properties}
    >
      <span
        data-slot='dropdown-menu-radio-item-indicator'
        className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className='size-2 fill-current' />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

/**
 * Keeps a dropdown open while toggling a boolean setting.
 *
 * @public
 * @example <caption>Render a switch-backed menu setting.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuSwitchItem } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuSwitchItem, { isChecked: true }, 'Snap to grid');
 * ```
 */
function DropdownMenuSwitchItem({
  className,
  children,
  isChecked,
  onIsCheckedChange,
  ...properties
}: Omit<React.ComponentProps<typeof DropdownMenuPrimitive.Item>, 'onSelect'> & {
  readonly isChecked: boolean;
  readonly onIsCheckedChange?: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-switch-item'
      className={cn(menuItemVariants(), 'justify-between', className)}
      onSelect={(event) => {
        event.preventDefault();
        onIsCheckedChange?.(!isChecked);
      }}
      {...properties}
    >
      <span className={menuItemLayoutClass}>{children}</span>
      <Switch
        className='data-[state=unchecked]:bg-muted-foreground!'
        checked={isChecked}
        onCheckedChange={onIsCheckedChange}
      />
    </DropdownMenuPrimitive.Item>
  );
}

type ToggleOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
};

type DropdownMenuToggleGroupItemProperties<T extends string> = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly infoTooltip?: React.ReactNode;
  readonly value: T;
  readonly options: Array<ToggleOption<T>>;
  readonly onValueChange?: (value: T) => void;
};

/**
 * Keeps a dropdown open while selecting one value from a compact toggle group.
 *
 * @public
 * @example <caption>Render a compact density selector.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuToggleGroupItem } from '@taucad/ui/components/dropdown-menu';
 *
 * const DensityMenuItem = DropdownMenuToggleGroupItem<'compact' | 'cozy'>;
 * const options: Array<{ value: 'compact' | 'cozy'; label: string }> = [
 *   { value: 'compact', label: 'Compact' },
 *   { value: 'cozy', label: 'Cozy' },
 * ];
 * createElement(DensityMenuItem, { value: 'compact', options, children: 'Density' });
 * ```
 */
function DropdownMenuToggleGroupItem<T extends string>({
  className,
  children,
  infoTooltip,
  value,
  options,
  onValueChange,
}: DropdownMenuToggleGroupItemProperties<T>): React.JSX.Element {
  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (newValue) {
        onValueChange?.(newValue as T);
      }
    },
    [onValueChange],
  );

  return (
    <div
      data-slot='dropdown-menu-toggle-group-item'
      className={cn('flex items-center justify-between px-3 py-1.5', className)}
      // Prevent dropdown from closing when interacting with toggle group
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <span className={cn(menuItemLayoutClass, menuItemIconClass, 'text-sm')}>
        {children}
        {infoTooltip}
      </span>
      <ToggleGroup
        type='single'
        variant='outline'
        value={value}
        className='font-semibold'
        onValueChange={handleValueChange}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.ariaLabel ?? option.value}
            className='h-7 flex-1'
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/**
 * Labels a group of dropdown-menu items.
 *
 * @public
 * @example <caption>Render an inset menu label.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuLabel } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuLabel, { isInset: true }, 'View');
 * ```
 */
function DropdownMenuLabel({
  className,
  isInset,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  readonly isInset?: boolean;
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Label
      data-slot='dropdown-menu-label'
      data-inset={isInset}
      className={cn(menuLabelVariants({ inset: isInset }), className)}
      {...properties}
    />
  );
}

/**
 * Visually separates dropdown-menu groups.
 *
 * @public
 * @example <caption>Render a menu separator.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuSeparator } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuSeparator);
 * ```
 */
function DropdownMenuSeparator({
  className,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot='dropdown-menu-separator'
      className={cn(menuSeparatorVariants(), className)}
      {...properties}
    />
  );
}

/**
 * Displays a keyboard shortcut beside a dropdown-menu item.
 *
 * @public
 * @example <caption>Show a menu shortcut.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuShortcut } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuShortcut, null, '⌘D');
 * ```
 */
function DropdownMenuShortcut({ className, ...properties }: React.ComponentProps<'span'>): React.JSX.Element {
  return <span data-slot='dropdown-menu-shortcut' className={cn(menuShortcutClass, className)} {...properties} />;
}

/**
 * Owns the open state for a nested dropdown-menu branch.
 *
 * @public
 * @example <caption>Create a nested menu branch.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuSub } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuSub);
 * ```
 */
function DropdownMenuSub({ ...properties }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>): React.JSX.Element {
  return <DropdownMenuPrimitive.Sub data-slot='dropdown-menu-sub' {...properties} />;
}

/**
 * Opens a nested dropdown menu when highlighted or activated.
 *
 * @public
 * @example <caption>Render a nested-menu trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuSubTrigger } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuSubTrigger, null, 'More');
 * ```
 */
function DropdownMenuSubTrigger({
  className,
  isInset,
  children,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  readonly isInset?: boolean;
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot='dropdown-menu-sub-trigger'
      data-inset={isInset}
      className={cn(menuItemVariants({ inset: isInset }), menuSubTriggerOpenClass, className)}
      {...properties}
    >
      {children}
      <ChevronRightIcon className='ml-auto size-3.5' />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

/**
 * Renders the positioned surface for a nested dropdown menu.
 *
 * @public
 * @example <caption>Render nested menu content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DropdownMenuSubContent } from '@taucad/ui/components/dropdown-menu';
 *
 * createElement(DropdownMenuSubContent);
 * ```
 */
function DropdownMenuSubContent({
  className,
  alignOffset = subMenuSideAlignOffset,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot='dropdown-menu-sub-content'
      alignOffset={alignOffset}
      className={cn(
        menuContentVariants(),
        'shadow-lg origin-(--radix-dropdown-menu-content-transform-origin)',
        className,
      )}
      {...properties}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSwitchItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
