import { useResponsiveSurfaceContainer } from '#hooks/responsive-surface.js';
import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive, Slot as SlotPrimitive } from 'radix-ui';
import { CheckIcon, ChevronRightIcon, CircleIcon, MinusIcon, XIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';
import {
  Drawer,
  DrawerAction,
  DrawerBar,
  DrawerClose,
  DrawerContent,
  DrawerList,
  DrawerNestedRoot,
  DrawerTitle,
  DrawerTrigger,
  drawerBarTitleClass,
  DrawerDivider,
  drawerRowAttributes,
  drawerRowClass,
  useIsInsideDrawer,
} from '#components/drawer.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Switch, SwitchIndicator } from '#components/switch.js';
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
  menuSwitchRowVariants,
} from '#components/menu.variants.js';
import { SwitchRowLabel } from '#components/switch-row-label.js';
import { useFullscreenElement } from '#hooks/use-fullscreen-element.js';

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
function DropdownMenu({
  isResponsive = false,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root> & {
  /**
   * Open the items in a bottom drawer on a phone, as `ComboBoxResponsive` does; wide screens keep the menu. Every part
   * has a drawer form: items, checkbox, radio and switch items as touch rows, a submenu as a group that expands in
   * place, and labels, separators, groups and shortcuts as they are. Name the drawer with the content's `drawerTitle`.
   */
  readonly isResponsive?: boolean;
}): React.JSX.Element {
  const isMobile = useIsMobile();
  if (isResponsive && isMobile) {
    return <DropdownMenuDrawer {...properties} />;
  }
  return (
    // A menu inside a responsive menu's drawer is a menu again: its parts must not take the drawer's forms.
    <DropdownMenuDrawerContext.Provider value={undefined}>
      <DropdownMenuPrimitive.Root data-slot='dropdown-menu' {...properties} />
    </DropdownMenuDrawerContext.Provider>
  );
}

type DropdownMenuDrawerState = {
  /** Closes the drawer, as choosing an item closes a menu. */
  readonly close: () => void;
  /** The trigger, where focus returns when the drawer closes and nothing else took it. */
  readonly triggerRef: React.RefObject<HTMLElement | undefined>;
};

/** A responsive menu's drawer on a phone; absent wherever the menu is a dropdown. */
const DropdownMenuDrawerContext = React.createContext<DropdownMenuDrawerState | undefined>(undefined);

/**
 * Selects a drawer row as a menu item selects: `onSelect` gets a cancelable select event, and the drawer closes unless
 * it was prevented.
 */
function selectDrawerRow(onSelect: ((event: Event) => void) | undefined, close: () => void): void {
  const select = new Event('menu.itemSelect', { cancelable: true });
  onSelect?.(select);
  if (!select.defaultPrevented) {
    close();
  }
}

/* A checkbox or radio row's text starts past its indicator column (`pl-11`), so its divider does too. */
const drawerIndicatorRowClass = 'pl-11 [--drawer-row-text-start:2.75rem]';

/** Hands a node to a ref the caller passed, as React would: a callback ref is called, an object ref is set. */
function assignRef<T>(
  ref: React.Ref<T> | undefined,
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React hands a ref null when its node unmounts.
  value: T | null,
): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

/**
 * A responsive menu on a phone: the same open state, held by a drawer. One opened from inside another drawer stacks on
 * it.
 */
function DropdownMenuDrawer({
  open: openProperty,
  defaultOpen = false,
  onOpenChange,
  children,
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isInsideDrawer = useIsInsideDrawer();
  const triggerRef = React.useRef<HTMLElement | undefined>(undefined);
  const open = openProperty ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProperty === undefined) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [openProperty, onOpenChange],
  );
  const context = React.useMemo(
    () => ({
      close() {
        setOpen(false);
      },
      triggerRef,
    }),
    [setOpen],
  );
  const DrawerRoot = isInsideDrawer ? DrawerNestedRoot : Drawer;
  return (
    <DropdownMenuDrawerContext.Provider value={context}>
      <DrawerRoot open={open} onOpenChange={setOpen}>
        {children}
      </DrawerRoot>
    </DropdownMenuDrawerContext.Provider>
  );
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    // A drawer's rows are already in its portal.
    return <DropdownMenuDrawerPortal>{properties.children}</DropdownMenuDrawerPortal>;
  }
  return <DropdownMenuPrimitive.Portal data-slot='dropdown-menu-portal' {...properties} />;
}

/** A responsive menu's portal in its drawer: nothing of its own, since the drawer's rows are already portaled. */
function DropdownMenuDrawerPortal({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  return <div className='contents'>{children}</div>;
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    const { ref, ...trigger } = properties;
    return (
      <DrawerTrigger
        ref={(node) => {
          drawer.triggerRef.current = node ?? undefined;
          assignRef(ref, node);
        }}
        data-slot='dropdown-menu-trigger'
        className={cn('outline-none focus-visible:focus-outline', className)}
        {...trigger}
      />
    );
  }
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot='dropdown-menu-trigger'
      className={cn('outline-none focus-visible:focus-outline', className)}
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
  drawerTitle = 'Options',
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  /**
   * The heading of a responsive menu's drawer on a phone, which also names it. Every responsive menu should name it
   * after what it holds (`Help`, the row's name); `Options` is only the fallback.
   */
  readonly drawerTitle?: string;
}): React.JSX.Element {
  const fullscreenElement = useFullscreenElement();
  const surfaceContainer = useResponsiveSurfaceContainer();
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    return (
      <DropdownMenuDrawerContent
        title={drawerTitle}
        triggerRef={drawer.triggerRef}
        onCloseAutoFocus={properties.onCloseAutoFocus}
        onEscapeKeyDown={properties.onEscapeKeyDown}
      >
        {properties.children}
      </DropdownMenuDrawerContent>
    );
  }
  const resolvedAlignOffset = alignOffset ?? (side === 'left' || side === 'right' ? menuSideAlignOffset : undefined);

  return (
    <DropdownMenuPrimitive.Portal container={surfaceContainer ?? fullscreenElement}>
      <DropdownMenuPrimitive.Content
        collisionBoundary={surfaceContainer}
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
 * A responsive menu's drawer: its title and a circular Close, then the items as touch rows. It sits above the phone
 * sidebar sheet (z-100), the surface most of these menus open from.
 */
function DropdownMenuDrawerContent({
  title,
  triggerRef,
  children,
  onCloseAutoFocus,
  onEscapeKeyDown,
}: Pick<React.ComponentProps<typeof DrawerContent>, 'children' | 'onCloseAutoFocus' | 'onEscapeKeyDown'> & {
  readonly title: string;
  readonly triggerRef: React.RefObject<HTMLElement | undefined>;
}): React.JSX.Element {
  return (
    <DrawerContent
      aria-describedby={undefined}
      className='z-110'
      overlayClassName='z-110'
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        if (!event.defaultPrevented) {
          // The drawer returns focus to its trigger itself.
          return;
        }
        /* A menu that keeps focus from returning (its item may open what takes focus next) leaves it on the page in a
           drawer, where nothing moves it: back to the trigger, unless something took it or the trigger is gone. */
        const focused = document.activeElement;
        const drawer = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
        const isFocusLost = !focused || focused === document.body || drawer?.contains(focused) === true;
        if (isFocusLost && triggerRef.current?.isConnected) {
          triggerRef.current.focus({ preventScroll: true });
        }
      }}
      onEscapeKeyDown={onEscapeKeyDown}
      onOpenAutoFocus={(event) => {
        // As a menu opens: focus on its first item that can take it, so the keys reach the items at once.
        event.preventDefault();
        const drawer = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
        const first = drawer?.querySelector<HTMLElement>(
          '[data-slot=dropdown-menu-drawer-items] :is(button, a[href]):not(:disabled, [aria-disabled=true], [tabindex="-1"])',
        );
        (first ?? drawer)?.focus({ preventScroll: true });
      }}
    >
      <DrawerBar>
        <DrawerTitle className={drawerBarTitleClass}>{title}</DrawerTitle>
        <DrawerClose asChild>
          <DrawerAction aria-label='Close'>
            <XIcon aria-hidden className='size-4' />
          </DrawerAction>
        </DrawerClose>
      </DrawerBar>
      {/* A dialog's group of buttons: checkbox, radio and switch rows use the plain `checkbox`, `radio` and `switch`
       * roles, since the `menuitem*` roles need a `menu` parent that a drawer does not have. */}
      <DrawerDivider />
      <DrawerList
        role='group'
        aria-label={title}
        data-slot='dropdown-menu-drawer-items'
        className='flex min-h-0 flex-col overflow-y-auto py-1 pb-3'
      >
        {children}
      </DrawerList>
    </DrawerContent>
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    const { asChild: _asChild, ...group } = properties;
    return <div role='group' data-slot='dropdown-menu-group' className={cn('flex flex-col', className)} {...group} />;
  }
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    return (
      <DropdownMenuDrawerItem
        className={className}
        isInset={isInset}
        variant={variant}
        close={drawer.close}
        {...properties}
      />
    );
  }
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
 * A menu item as a drawer's touch row. It selects as a menu item does: `onSelect` runs after `onClick`, and the drawer
 * closes unless either prevented the default.
 */
function DropdownMenuDrawerItem({
  className,
  isInset,
  variant,
  close,
  asChild = false,
  disabled = false,
  onSelect,
  onClick,
  textValue: _textValue,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  readonly isInset?: boolean;
  readonly variant: 'default' | 'destructive';
  readonly close: () => void;
}): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';
  return (
    <Comp
      data-slot='dropdown-menu-item'
      {...drawerRowAttributes}
      data-inset={isInset}
      data-variant={variant}
      data-disabled={disabled ? '' : undefined}
      type={asChild ? undefined : 'button'}
      disabled={asChild ? undefined : disabled}
      aria-disabled={disabled || undefined}
      className={cn(menuItemVariants({ variant, inset: isInset }), drawerRowClass, className)}
      {...(properties as React.ComponentProps<'button'>)}
      // A disabled link is out of the tab order, as a disabled button is.
      tabIndex={asChild && disabled ? -1 : properties.tabIndex}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          // A disabled button fires no click; a disabled link must not follow its href either.
          event.preventDefault();
          return;
        }
        // The caller's handler is typed for the menu's div item; in a drawer the row is a button (or its child).
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
        if (event.defaultPrevented) {
          return;
        }
        selectDrawerRow(onSelect, close);
      }}
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    return (
      <DropdownMenuDrawerCheckboxItem className={className} checked={checked} close={drawer.close} {...properties}>
        {children}
      </DropdownMenuDrawerCheckboxItem>
    );
  }
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
 * A checkbox item as a drawer's touch row (`checkbox`): choosing it toggles it, as a menu's does, then closes
 * the drawer unless `onSelect` prevented that.
 */
function DropdownMenuDrawerCheckboxItem({
  className,
  children,
  checked = false,
  onCheckedChange,
  onSelect,
  onClick,
  disabled = false,
  close,
  asChild: _asChild,
  textValue: _textValue,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  readonly close: () => void;
}): React.JSX.Element {
  const isIndeterminate = checked === 'indeterminate';
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={isIndeterminate ? 'mixed' : checked}
      data-slot='dropdown-menu-checkbox-item'
      {...drawerRowAttributes}
      data-state={isIndeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked'}
      data-disabled={disabled ? '' : undefined}
      disabled={disabled}
      className={cn(menuItemVariants(), drawerRowClass, drawerIndicatorRowClass, className)}
      {...(properties as React.ComponentProps<'button'>)}
      onClick={(event) => {
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
        if (event.defaultPrevented) {
          return;
        }
        // As a menu's: the toggle happens even when `onSelect` keeps the menu open.
        selectDrawerRow((select) => {
          onSelect?.(select);
          onCheckedChange?.(isIndeterminate ? true : !checked);
        }, close);
      }}
    >
      <span className='pointer-events-none absolute left-4 flex size-4 items-center justify-center'>
        {isIndeterminate ? <MinusIcon className='size-4' /> : checked ? <CheckIcon className='size-4' /> : null}
      </span>
      {children}
    </button>
  );
}

/** A drawer's radio group: its value and how a row changes it. */
const DropdownMenuDrawerRadioContext = React.createContext<
  Pick<React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>, 'value' | 'onValueChange'> | undefined
>(undefined);

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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    return <DropdownMenuDrawerRadioGroup className={className} {...properties} />;
  }
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot='dropdown-menu-radio-group'
      className={cn('flex flex-col gap-0.5', className)}
      {...properties}
    />
  );
}

/** A radio group in a drawer: a `radiogroup` of `radio` rows that share its value. */
function DropdownMenuDrawerRadioGroup({
  className,
  value,
  onValueChange,
  asChild: _asChild,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>): React.JSX.Element {
  const radio = React.useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
  return (
    <DropdownMenuDrawerRadioContext.Provider value={radio}>
      <div
        role='radiogroup'
        data-slot='dropdown-menu-radio-group'
        className={cn('flex flex-col', className)}
        {...(properties as React.ComponentProps<'div'>)}
      />
    </DropdownMenuDrawerRadioContext.Provider>
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  const radio = React.useContext(DropdownMenuDrawerRadioContext);
  if (drawer) {
    const { value, onSelect, onClick, disabled = false, asChild: _asChild, textValue: _textValue, ...row } = properties;
    const isChecked = radio?.value === value;
    return (
      <button
        type='button'
        role='radio'
        aria-checked={isChecked}
        data-slot='dropdown-menu-radio-item'
        {...drawerRowAttributes}
        data-state={isChecked ? 'checked' : 'unchecked'}
        data-disabled={disabled ? '' : undefined}
        disabled={disabled}
        className={cn(menuItemVariants(), drawerRowClass, drawerIndicatorRowClass, className)}
        {...(row as React.ComponentProps<'button'>)}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
          if (event.defaultPrevented) {
            return;
          }
          selectDrawerRow((select) => {
            onSelect?.(select);
            radio?.onValueChange?.(value);
          }, drawer.close);
        }}
      >
        <span
          data-slot='dropdown-menu-radio-item-indicator'
          className='pointer-events-none absolute left-4 flex size-4 items-center justify-center'
        >
          {isChecked ? <CircleIcon className='size-2 fill-current' /> : null}
        </span>
        {children}
      </button>
    );
  }
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
 * Keeps a dropdown open while toggling a boolean setting. It shares its row classes and label
 * layout with `SwitchRow`, the same row for surfaces that are not a dropdown menu.
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
  icon,
  description,
  isChecked,
  onIsCheckedChange,
  ...properties
}: Omit<React.ComponentProps<typeof DropdownMenuPrimitive.Item>, 'onSelect'> & {
  /** A leading icon, drawn before the title (and beside both lines when there is a description). */
  readonly icon?: React.ReactNode;
  /** A second line under the title. */
  readonly description?: React.ReactNode;
  readonly isChecked: boolean;
  readonly onIsCheckedChange?: (checked: boolean) => void;
}): React.JSX.Element {
  const id = React.useId();
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    const { onClick, disabled = false, asChild: _asChild, textValue: _textValue, ...row } = properties;
    // The row is the control (`switch`); the switch only shows its state. Toggling keeps the drawer open.
    return (
      <button
        type='button'
        role='switch'
        aria-checked={isChecked}
        aria-labelledby={`${id}-title`}
        {...(description === undefined ? {} : { 'aria-describedby': `${id}-description` })}
        data-slot='dropdown-menu-switch-item'
        {...drawerRowAttributes}
        data-disabled={disabled ? '' : undefined}
        disabled={disabled}
        className={cn(
          menuItemVariants(),
          menuSwitchRowVariants({ described: description !== undefined }),
          drawerRowClass,
          className,
        )}
        {...(row as React.ComponentProps<'button'>)}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
          if (!event.defaultPrevented) {
            onIsCheckedChange?.(!isChecked);
          }
        }}
      >
        <SwitchRowLabel
          icon={icon}
          description={description}
          titleId={`${id}-title`}
          descriptionId={`${id}-description`}
        >
          {children}
        </SwitchRowLabel>
        <SwitchIndicator isChecked={isChecked} />
      </button>
    );
  }
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-switch-item'
      className={cn(menuItemVariants(), menuSwitchRowVariants({ described: description !== undefined }), className)}
      onSelect={(event) => {
        event.preventDefault();
        onIsCheckedChange?.(!isChecked);
      }}
      {...properties}
    >
      <SwitchRowLabel icon={icon} description={description} titleId={`${id}-title`} descriptionId={`${id}-description`}>
        {children}
      </SwitchRowLabel>
      <Switch
        checked={isChecked}
        aria-labelledby={`${id}-title`}
        {...(description === undefined ? {} : { 'aria-describedby': `${id}-description` })}
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    const { asChild: _asChild, ...label } = properties;
    return (
      <div
        data-slot='dropdown-menu-label'
        data-inset={isInset}
        className={cn(menuLabelVariants({ inset: isInset }), 'px-4', className)}
        {...label}
      />
    );
  }
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    const { asChild: _asChild, ...separator } = properties;
    return (
      <div
        role='separator'
        data-slot='dropdown-menu-separator'
        // Inset like the row dividers: from the rows' text to the rows' right inset.
        className={cn(menuSeparatorVariants(), 'my-1 mr-4 ml-11', className)}
        {...separator}
      />
    );
  }
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  if (drawer) {
    return <DropdownMenuDrawerSub {...properties} />;
  }
  return <DropdownMenuPrimitive.Sub data-slot='dropdown-menu-sub' {...properties} />;
}

type DropdownMenuDrawerSubState = {
  readonly isOpen: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly contentId: string;
};

/** A submenu in a drawer: its trigger expands its items in place, under it. */
const DropdownMenuDrawerSubContext = React.createContext<DropdownMenuDrawerSubState | undefined>(undefined);

function DropdownMenuDrawerSub({
  open: openProperty,
  defaultOpen = false,
  onOpenChange,
  children,
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const contentId = React.useId();
  const isOpen = openProperty ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProperty === undefined) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [openProperty, onOpenChange],
  );
  const sub = React.useMemo(() => ({ isOpen, setOpen, contentId }), [isOpen, setOpen, contentId]);
  return (
    <DropdownMenuDrawerSubContext.Provider value={sub}>
      <div data-slot='dropdown-menu-sub' className='flex flex-col'>
        {children}
      </div>
    </DropdownMenuDrawerSubContext.Provider>
  );
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
  const drawer = React.useContext(DropdownMenuDrawerContext);
  const sub = React.useContext(DropdownMenuDrawerSubContext);
  if (drawer) {
    const { onClick, disabled = false, asChild: _asChild, textValue: _textValue, ...row } = properties;
    return (
      <button
        type='button'
        aria-expanded={sub?.isOpen ?? false}
        aria-controls={sub?.isOpen ? sub.contentId : undefined}
        data-slot='dropdown-menu-sub-trigger'
        {...drawerRowAttributes}
        data-inset={isInset}
        data-state={sub?.isOpen ? 'open' : 'closed'}
        data-disabled={disabled ? '' : undefined}
        disabled={disabled}
        className={cn(menuItemVariants({ inset: isInset }), drawerRowClass, className)}
        {...(row as React.ComponentProps<'button'>)}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
          if (!event.defaultPrevented) {
            sub?.setOpen(!sub.isOpen);
          }
        }}
      >
        {children}
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'ml-auto size-4 transition-transform motion-reduce:transition-none',
            sub?.isOpen && 'rotate-90',
          )}
        />
      </button>
    );
  }
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
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>): React.JSX.Element | undefined {
  const drawer = React.useContext(DropdownMenuDrawerContext);
  const sub = React.useContext(DropdownMenuDrawerSubContext);
  if (drawer) {
    if (!sub?.isOpen) {
      return undefined;
    }
    return (
      <div
        id={sub.contentId}
        role='group'
        data-slot='dropdown-menu-sub-content'
        className={cn('flex flex-col pl-4', className)}
      >
        {properties.children}
      </div>
    );
  }
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
