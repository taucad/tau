import * as React from 'react';
import { NavigationMenu as NavigationMenuPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

const NavigationMenuViewportContext = React.createContext(true);

/**
 * Owns keyboard navigation and optional shared viewport behavior for site links.
 *
 * @public
 * @example <caption>Render a navigation menu with its shared viewport.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenu } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenu, { hasViewport: true });
 * ```
 */
function NavigationMenu({
  className,
  children,
  hasViewport = true,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  readonly hasViewport?: boolean;
}): React.JSX.Element {
  return (
    <NavigationMenuViewportContext.Provider value={hasViewport}>
      <NavigationMenuPrimitive.Root
        data-slot='navigation-menu'
        data-viewport={hasViewport}
        className={cn('group/navigation-menu relative flex max-w-max flex-1 items-center justify-center', className)}
        {...properties}
      >
        {children}
        {hasViewport ? <NavigationMenuViewport /> : null}
      </NavigationMenuPrimitive.Root>
    </NavigationMenuViewportContext.Provider>
  );
}

/**
 * Provides the ordered collection of top-level navigation items.
 *
 * @public
 * @example <caption>Render a navigation-menu list.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuList } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuList);
 * ```
 */
function NavigationMenuList({
  className,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>): React.JSX.Element {
  return (
    <NavigationMenuPrimitive.List
      data-slot='navigation-menu-list'
      className={cn('group flex flex-1 list-none items-center justify-center gap-1', className)}
      {...properties}
    />
  );
}

/**
 * Owns one top-level navigation entry and its optional panel.
 *
 * @public
 * @example <caption>Render a navigation-menu item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuItem } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuItem);
 * ```
 */
function NavigationMenuItem({
  className,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>): React.JSX.Element {
  return (
    <NavigationMenuPrimitive.Item
      data-slot='navigation-menu-item'
      className={cn('relative', className)}
      {...properties}
    />
  );
}

/**
 * Returns the standard visual treatment for a navigation-menu trigger.
 *
 * @public
 * @example <caption>Style a custom navigation trigger.</caption>
 * ```typescript
 * import { navigationMenuTriggerStyle } from '@taucad/ui/components/navigation-menu';
 *
 * const className = navigationMenuTriggerStyle();
 * ```
 */
const navigationMenuTriggerStyle = cva(
  'group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium outline-none transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent/50 data-[state=open]:text-accent-foreground data-[state=open]:hover:bg-accent data-[state=open]:focus:bg-accent',
);

/**
 * Opens a navigation-menu content panel with keyboard support.
 *
 * @public
 * @example <caption>Render a navigation trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuTrigger } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuTrigger, null, 'Products');
 * ```
 */
function NavigationMenuTrigger({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>): React.JSX.Element {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot='navigation-menu-trigger'
      className={cn(navigationMenuTriggerStyle(), 'group', className)}
      {...properties}
    >
      {children}{' '}
      <ChevronDownIcon
        className='relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180'
        aria-hidden='true'
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

/**
 * Renders the content panel associated with a navigation trigger.
 *
 * @public
 * @example <caption>Render navigation content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuContent } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuContent, null, 'Products');
 * ```
 */
function NavigationMenuContent({
  className,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>): React.JSX.Element {
  const hasViewport = React.useContext(NavigationMenuViewportContext);

  return (
    <NavigationMenuPrimitive.Content
      data-slot='navigation-menu-content'
      className={cn(
        'top-0 left-0 w-full p-2 pr-2.5 data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out md:absolute md:w-auto',
        '**:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none',
        !hasViewport && popoverSurfaceVariants(),
        !hasViewport &&
          'top-full mt-1.5 overflow-hidden duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders the shared, animated viewport for navigation content.
 *
 * @public
 * @example <caption>Render the navigation viewport explicitly.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuViewport } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuViewport);
 * ```
 */
function NavigationMenuViewport({
  className,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>): React.JSX.Element {
  return (
    <div className={cn('absolute top-full left-0 isolate z-50 flex justify-center')}>
      <NavigationMenuPrimitive.Viewport
        data-slot='navigation-menu-viewport'
        className={cn(
          popoverSurfaceVariants(),
          'origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]',
          className,
        )}
        {...properties}
      />
    </div>
  );
}

/**
 * Renders a focus-visible link inside a navigation menu.
 *
 * @public
 * @example <caption>Render a navigation link.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuLink } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuLink, { href: '/docs' }, 'Docs');
 * ```
 */
function NavigationMenuLink({
  className,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>): React.JSX.Element {
  return (
    <NavigationMenuPrimitive.Link
      data-slot='navigation-menu-link'
      className={cn(
        "data-[active=true]:text-accent-foreground hover:text-accent-foreground focus:text-accent-foreground flex flex-col gap-1 rounded-sm p-2 text-sm outline-none transition-[color,box-shadow] hover:bg-accent focus:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-accent/50 data-[active=true]:hover:bg-accent data-[active=true]:focus:bg-accent [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Points from the active trigger toward the shared navigation viewport.
 *
 * @public
 * @example <caption>Render the active navigation indicator.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { NavigationMenuIndicator } from '@taucad/ui/components/navigation-menu';
 *
 * createElement(NavigationMenuIndicator);
 * ```
 */
function NavigationMenuIndicator({
  className,
  ...properties
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>): React.JSX.Element {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot='navigation-menu-indicator'
      className={cn(
        'top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in',
        className,
      )}
      {...properties}
    >
      <div className='relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md' />
    </NavigationMenuPrimitive.Indicator>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
};
