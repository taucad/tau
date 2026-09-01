/* oxlint-disable react-js/boolean-prop-naming -- The requested controlled API uses open/defaultOpen. */
import * as React from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { useIsMobile } from '#hooks/use-mobile.js';
import { cn } from '#utils/cn.js';
import { Button } from '#components/button.js';
import { Input } from '#components/input.js';
import { Separator } from '#components/separator.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#components/sheet.js';
import { Skeleton } from '#components/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/tooltip.js';

const sidebarDefaultOpen = true;
const sidebarDefaultKeyboardShortcutKey = 'b';
const sidebarWidth = 'calc(var(--spacing) * 56)';
const sidebarWidthMobile = 'calc(var(--spacing) * 72)';
const sidebarWidthIcon = 'calc(var(--spacing) * 2)';

type SidebarContextProperties = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  keyboardShortcutKey: string | undefined;
  toggleSidebar: () => void;
};

type CssVariableProperties = React.CSSProperties & Record<`--${string}`, number | string | undefined>;

const SidebarContext = React.createContext<SidebarContextProperties | undefined>(undefined);

/**
 * Reads the state and controls supplied by the nearest {@link SidebarProvider}.
 *
 * @public
 * @example <caption>Read the current sidebar state.</caption>
 * ```typescript
 * import { useSidebar } from '@taucad/ui/components/sidebar';
 *
 * const SidebarState = () => useSidebar().state;
 * ```
 */
function useSidebar(): SidebarContextProperties {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}

/**
 * Provides controlled or uncontrolled sidebar state, mobile state, and a keyboard shortcut.
 *
 * @public
 * @example <caption>Provide uncontrolled sidebar state.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarProvider } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarProvider, { defaultOpen: true, keyboardShortcutKey: 'b' });
 * ```
 */
function SidebarProvider({
  defaultOpen = sidebarDefaultOpen,
  open: openProperty,
  onOpenChange,
  keyboardShortcutKey = sidebarDefaultKeyboardShortcutKey,
  className,
  style,
  children,
  ...properties
}: React.ComponentProps<'div'> & {
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly keyboardShortcutKey?: string;
}): React.JSX.Element {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);

  const open = openProperty ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value;
      if (openProperty === undefined) {
        setUncontrolledOpen(openState);
      }
      onOpenChange?.(openState);
    },
    [onOpenChange, open, openProperty],
  );

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((open) => !open);
    } else {
      setOpen((open) => !open);
    }
  }, [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    if (!keyboardShortcutKey) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== keyboardShortcutKey.toLowerCase()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [keyboardShortcutKey, toggleSidebar]);

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo<SidebarContextProperties>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      keyboardShortcutKey,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, keyboardShortcutKey, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot='sidebar-wrapper'
        style={
          {
            '--sidebar-width': sidebarWidth,
            '--sidebar-width-icon': sidebarWidthIcon,
            '--sidebar-width-current': isMobile ? sidebarWidthMobile : open ? sidebarWidth : sidebarWidthIcon,
            '--sidebar-padding-offset': open ? sidebarWidth : '0px',
            ...style,
          } as CssVariableProperties
        }
        className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)}
        {...properties}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/**
 * Renders a responsive desktop sidebar or mobile sheet.
 *
 * @public
 * @example <caption>Render an icon-collapsible sidebar.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Sidebar } from '@taucad/ui/components/sidebar';
 *
 * createElement(Sidebar, { collapsible: 'icon' });
 * ```
 */
function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ...properties
}: React.ComponentProps<'div'> & {
  readonly side?: 'left' | 'right';
  readonly variant?: 'sidebar' | 'floating' | 'inset';
  readonly collapsible?: 'offcanvas' | 'icon' | 'none';
}): React.JSX.Element {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === 'none') {
    return (
      <div
        data-slot='sidebar'
        className={cn('flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground', className)}
        {...properties}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...properties}>
        <SheetContent
          data-sidebar='sidebar'
          data-slot='sidebar'
          data-mobile='true'
          className='z-100 w-(--sidebar-width) bg-sidebar text-sidebar-foreground [&>button]:hidden'
          style={{ '--sidebar-width': sidebarWidthMobile } as CssVariableProperties}
          side={side}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <SheetHeader className='sr-only'>
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className='flex size-full flex-col'>{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className='group peer hidden text-sidebar-foreground md:block'
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-slot='sidebar'
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot='sidebar-container'
        className={cn(
          'fixed inset-y-0 z-30 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          // Adjust the padding for floating and inset variants.
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
          className,
        )}
        {...properties}
      >
        <div
          data-sidebar='sidebar'
          data-slot='sidebar-inner'
          className='relative flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border'
        >
          {children}
          <div className='pointer-events-none absolute inset-y-0 right-0 z-30 w-4 border-r border-sidebar-border shadow-[inset_-12px_0_16px_-14px_var(--sidebar-border)] group-data-[variant=floating]:hidden' />
        </div>
      </div>
    </div>
  );
}

/**
 * Toggles the sidebar and exposes the configured keyboard shortcut in a tooltip.
 *
 * @public
 * @example <caption>Render a sidebar trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarTrigger } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarTrigger, null, 'Menu');
 * ```
 */
function SidebarTrigger({
  className,
  onClick,
  children,
  ...properties
}: React.ComponentProps<typeof Button>): React.JSX.Element {
  const { keyboardShortcutKey, toggleSidebar, open } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-sidebar='trigger'
          data-slot='sidebar-trigger'
          data-open={open}
          variant='ghost'
          size='icon'
          className={cn('size-7', open ? 'cursor-w-resize' : 'cursor-e-resize', className)}
          onClick={(event) => {
            onClick?.(event);
            toggleSidebar();
          }}
          {...properties}
        >
          {children}
          <span className='sr-only'>Toggle Sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {open ? 'Close Sidebar' : 'Open Sidebar'}
        {keyboardShortcutKey ? (
          <kbd className='ml-1 hidden rounded-xs bg-primary-foreground/30 px-1 text-xs font-normal tracking-wider text-primary-foreground select-none md:inline-flex'>
            ⌘/Ctrl+{keyboardShortcutKey.toUpperCase()}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Provides a narrow pointer target for expanding or collapsing the sidebar.
 *
 * @public
 * @example <caption>Render the sidebar rail.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarRail } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarRail);
 * ```
 */
function SidebarRail({ className, ...properties }: React.ComponentProps<'button'>): React.JSX.Element {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type='button'
      data-sidebar='rail'
      data-slot='sidebar-rail'
      aria-label='Toggle Sidebar'
      tabIndex={-1}
      title='Toggle Sidebar'
      className={cn(
        'absolute inset-y-0 z-20 my-5 hidden w-4 -translate-x-1/2 opacity-0 transition-[width] ease-linear group-data-[side=left]:-right-3 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:bg-neutral/50 after:transition-[width] after:duration-200 after:ease-in-out hover:opacity-100 hover:after:w-[3px] hover:after:transition-all active:after:w-[3px] active:after:bg-neutral/50 sm:flex',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-transparent',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-1',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-1',
        className,
      )}
      onClick={toggleSidebar}
      {...properties}
    />
  );
}

/**
 * Renders the main-page surface beside an inset sidebar.
 *
 * @public
 * @example <caption>Render sidebar-adjacent page content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarInset } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarInset, null, 'Page content');
 * ```
 */
function SidebarInset({ className, ...properties }: React.ComponentProps<'main'>): React.JSX.Element {
  return (
    <main
      data-slot='sidebar-inset'
      className={cn(
        'relative flex w-full flex-1 flex-col bg-background',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders a compact input styled for a sidebar surface.
 *
 * @public
 * @example <caption>Add search to a sidebar.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarInput } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarInput, { placeholder: 'Search' });
 * ```
 */
function SidebarInput({ className, ...properties }: React.ComponentProps<typeof Input>): React.JSX.Element {
  return (
    <Input
      autoComplete='off'
      data-slot='sidebar-input'
      data-sidebar='input'
      className={cn('h-7 w-full bg-background shadow-none', className)}
      {...properties}
    />
  );
}

/**
 * Stacks persistent content at the top of a sidebar.
 *
 * @public
 * @example <caption>Render a sidebar header.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarHeader } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarHeader, null, 'Workspace');
 * ```
 */
function SidebarHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='sidebar-header'
      data-sidebar='header'
      className={cn('flex flex-col gap-2 p-1', className)}
      {...properties}
    />
  );
}

/**
 * Stacks persistent actions at the bottom of a sidebar.
 *
 * @public
 * @example <caption>Render a sidebar footer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarFooter } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarFooter, null, 'Account');
 * ```
 */
function SidebarFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='sidebar-footer'
      data-sidebar='footer'
      className={cn('flex flex-col gap-2 p-0.5', className)}
      {...properties}
    />
  );
}

/**
 * Separates logical regions within a sidebar.
 *
 * @public
 * @example <caption>Render a sidebar separator.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarSeparator } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarSeparator);
 * ```
 */
function SidebarSeparator({ className, ...properties }: React.ComponentProps<typeof Separator>): React.JSX.Element {
  return (
    <Separator
      data-slot='sidebar-separator'
      data-sidebar='separator'
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...properties}
    />
  );
}

/**
 * Provides the scrollable middle region of a sidebar.
 *
 * @public
 * @example <caption>Render scrollable sidebar content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarContent } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarContent, null, 'Navigation');
 * ```
 */
function SidebarContent({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='sidebar-content'
      data-sidebar='content'
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Groups related sidebar controls and menu entries.
 *
 * @public
 * @example <caption>Render a sidebar group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarGroup } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarGroup);
 * ```
 */
function SidebarGroup({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='sidebar-group'
      data-sidebar='group'
      className={cn('relative flex w-full min-w-0 flex-col px-1 py-2', className)}
      {...properties}
    />
  );
}

/**
 * Labels a sidebar group and collapses with icon-only sidebars.
 *
 * @public
 * @example <caption>Name a sidebar group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarGroupLabel } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarGroupLabel, null, 'Projects');
 * ```
 */
function SidebarGroupLabel({
  className,
  asChild = false,
  ...properties
}: React.ComponentProps<'div'> & {
  readonly asChild?: boolean;
}): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'div';

  return (
    <Comp
      data-slot='sidebar-group-label'
      data-sidebar='group-label'
      className={cn(
        'flex h-7 shrink-0 items-center rounded-md px-2 text-sm font-medium whitespace-nowrap text-muted-foreground/55 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Positions a compact action beside a sidebar-group label.
 *
 * @public
 * @example <caption>Add an action to a sidebar group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarGroupAction } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarGroupAction, { 'aria-label': 'Add project' }, '+');
 * ```
 */
function SidebarGroupAction({
  className,
  asChild = false,
  ...properties
}: React.ComponentProps<'button'> & {
  readonly asChild?: boolean;
}): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';

  return (
    <Comp
      data-slot='sidebar-group-action'
      data-sidebar='group-action'
      className={cn(
        'absolute top-1/2 right-3 flex aspect-square w-5 -translate-y-1/2 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Contains the body of a sidebar group.
 *
 * @public
 * @example <caption>Render sidebar-group content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarGroupContent } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarGroupContent, null, 'Projects');
 * ```
 */
function SidebarGroupContent({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='sidebar-group-content'
      data-sidebar='group-content'
      className={cn('w-full text-sm', className)}
      {...properties}
    />
  );
}

/**
 * Provides the list container for sidebar menu items.
 *
 * @public
 * @example <caption>Render a sidebar menu.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenu } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenu);
 * ```
 */
function SidebarMenu({ className, ...properties }: React.ComponentProps<'ul'>): React.JSX.Element {
  return (
    <ul
      data-slot='sidebar-menu'
      data-sidebar='menu'
      className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}
      {...properties}
    />
  );
}

/**
 * Positions a sidebar menu button, action, and badge as one list item.
 *
 * @public
 * @example <caption>Render a sidebar menu item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuItem } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuItem);
 * ```
 */
function SidebarMenuItem({ className, ...properties }: React.ComponentProps<'li'>): React.JSX.Element {
  return (
    <li
      data-slot='sidebar-menu-item'
      data-sidebar='menu-item'
      className={cn('group/menu-item relative', className)}
      {...properties}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md py-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent group-data-[collapsible=icon]:size-7! px-1.5 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent',
        outline:
          'bg-background border-sidebar-border border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      },
      size: {
        default: 'h-7 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-11 text-sm group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Renders the primary interactive control for a sidebar menu item.
 *
 * @public
 * @example <caption>Render an active sidebar menu button.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuButton } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuButton, { isActive: true, tooltip: 'Projects' }, 'Projects');
 * ```
 */
function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  onClick,
  ...properties
}: React.ComponentProps<'button'> & {
  readonly asChild?: boolean;
  readonly isActive?: boolean;
  readonly tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      data-slot='sidebar-menu-button'
      data-sidebar='menu-button'
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      onClick={onClick}
      {...properties}
    />
  );

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === 'string') {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side='right' align='center' hidden={state !== 'collapsed' || isMobile} {...tooltip} />
    </Tooltip>
  );
}

/**
 * Positions a secondary action beside a sidebar menu button.
 *
 * @public
 * @example <caption>Add an always-visible sidebar menu action.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuAction } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuAction, { 'aria-label': 'More' }, '…');
 * ```
 */
function SidebarMenuAction({
  className,
  asChild = false,
  shouldShowOnHover = false,
  ...properties
}: React.ComponentProps<'button'> & {
  readonly asChild?: boolean;
  readonly shouldShowOnHover?: boolean;
}): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';

  return (
    <Comp
      data-slot='sidebar-menu-action'
      data-sidebar='menu-action'
      className={cn(
        'absolute top-1/2 right-1 flex aspect-square w-5 -translate-y-1/2 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        shouldShowOnHover &&
          'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Displays compact metadata beside a sidebar menu item.
 *
 * @public
 * @example <caption>Show a count beside a sidebar item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuBadge } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuBadge, null, '3');
 * ```
 */
function SidebarMenuBadge({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='sidebar-menu-badge'
      data-sidebar='menu-badge'
      className={cn(
        'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
        'top-1/2 -translate-y-1/2 peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders a loading placeholder shaped like a sidebar menu item.
 *
 * @public
 * @example <caption>Render a sidebar menu placeholder with an icon.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuSkeleton } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuSkeleton, { hasIcon: true });
 * ```
 */
function SidebarMenuSkeleton({
  className,
  hasIcon = false,
  ...properties
}: React.ComponentProps<'div'> & {
  readonly hasIcon?: boolean;
}): React.JSX.Element {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      data-slot='sidebar-menu-skeleton'
      data-sidebar='menu-skeleton'
      className={cn('flex h-7 items-center gap-2 rounded-md px-2', className)}
      {...properties}
    >
      {hasIcon ? <Skeleton className='size-4 rounded-md' data-sidebar='menu-skeleton-icon' /> : null}
      <Skeleton
        className='h-4 max-w-(--skeleton-width) flex-1'
        data-sidebar='menu-skeleton-text'
        style={{ '--skeleton-width': width } as CssVariableProperties}
      />
    </div>
  );
}

/**
 * Provides the list container for nested sidebar menu items.
 *
 * @public
 * @example <caption>Render a nested sidebar menu.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuSub } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuSub);
 * ```
 */
function SidebarMenuSub({ className, ...properties }: React.ComponentProps<'ul'>): React.JSX.Element {
  return (
    <ul
      data-slot='sidebar-menu-sub'
      data-sidebar='menu-sub'
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Positions one nested sidebar-menu link.
 *
 * @public
 * @example <caption>Render a nested sidebar-menu item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuSubItem } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuSubItem);
 * ```
 */
function SidebarMenuSubItem({ className, ...properties }: React.ComponentProps<'li'>): React.JSX.Element {
  return (
    <li
      data-slot='sidebar-menu-sub-item'
      data-sidebar='menu-sub-item'
      className={cn('group/menu-sub-item relative', className)}
      {...properties}
    />
  );
}

/**
 * Renders a link within a nested sidebar menu.
 *
 * @public
 * @example <caption>Render an active nested sidebar link.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SidebarMenuSubButton } from '@taucad/ui/components/sidebar';
 *
 * createElement(SidebarMenuSubButton, { href: '/projects', isActive: true }, 'Projects');
 * ```
 */
function SidebarMenuSubButton({
  asChild = false,
  size = 'md',
  isActive = false,
  className,
  ...properties
}: React.ComponentProps<'a'> & {
  readonly asChild?: boolean;
  readonly size?: 'sm' | 'md';
  readonly isActive?: boolean;
}): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'a';

  return (
    <Comp
      data-slot='sidebar-menu-sub-button'
      data-sidebar='menu-sub-button'
      data-size={size}
      data-active={isActive}
      className={cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...properties}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
