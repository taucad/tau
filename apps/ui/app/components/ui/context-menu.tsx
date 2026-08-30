/* oxlint-disable react/boolean-prop-naming -- Shadcn convention. */
import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';
import { MenuSliderItem, preventMenuSliderEscapeDismissal } from '#components/ui/menu-slider-item.js';
import type { MenuSliderItemProperties } from '#components/ui/menu-slider-item.js';
import { cn } from '#utils/ui.utils.js';
import {
  menuItemVariants,
  menuContentVariants,
  menuLabelVariants,
  menuSeparatorVariants,
  menuSubTriggerOpenClass,
  menuShortcutClass,
  subMenuSideAlignOffset,
} from '#components/ui/menu.variants.js';

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>): React.JSX.Element {
  return <ContextMenuPrimitive.Root data-slot='context-menu' {...props} />;
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>): React.JSX.Element {
  return <ContextMenuPrimitive.Trigger data-slot='context-menu-trigger' {...props} />;
}

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

function ContextMenuPortal({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Portal>): React.JSX.Element {
  return <ContextMenuPrimitive.Portal data-slot='context-menu-portal' {...props} />;
}

function ContextMenuSub({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>): React.JSX.Element {
  return <ContextMenuPrimitive.Sub data-slot='context-menu-sub' {...props} />;
}

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

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
  readonly inset?: boolean;
}): React.JSX.Element {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot='context-menu-sub-trigger'
      data-inset={inset}
      className={cn(menuItemVariants({ inset }), menuSubTriggerOpenClass, className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className='ml-auto size-3.5' />
    </ContextMenuPrimitive.SubTrigger>
  );
}

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

function ContextMenuContent({
  className,
  onEscapeKeyDown,
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
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          preventMenuSliderEscapeDismissal(event);
        }}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
  readonly inset?: boolean;
  readonly variant?: 'default' | 'destructive';
}): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Item
      data-slot='context-menu-item'
      data-inset={inset}
      data-variant={variant}
      className={cn(menuItemVariants({ variant, inset }), className)}
      {...props}
    />
  );
}

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

type ContextMenuSliderItemProperties = Omit<MenuSliderItemProperties, 'dataSlot'>;

function ContextMenuSliderItem(properties: ContextMenuSliderItemProperties): React.JSX.Element {
  return <MenuSliderItem dataSlot='context-menu-slider-item' {...properties} />;
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
  readonly inset?: boolean;
}): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Label
      data-slot='context-menu-label'
      data-inset={inset}
      className={cn(menuLabelVariants({ inset }), className)}
      {...props}
    />
  );
}

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
  ContextMenuSliderItem,
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
