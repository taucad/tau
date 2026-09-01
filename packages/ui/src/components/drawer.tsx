import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '#utils/cn.js';

const DrawerContext = React.createContext(false);

/**
 * Reports whether the caller is rendered inside a {@link Drawer}.
 *
 * @public
 * @example <caption>Adapt a component to a drawer context.</caption>
 * ```typescript
 * import { useIsInsideDrawer } from '@taucad/ui/components/drawer';
 *
 * const DrawerAware = () => useIsInsideDrawer() ? 'drawer' : 'page';
 * ```
 */
function useIsInsideDrawer(): boolean {
  return React.useContext(DrawerContext);
}

/**
 * Owns the open state and gesture lifecycle for a drawer.
 *
 * @public
 * @example <caption>Open a drawer by default.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Drawer } from '@taucad/ui/components/drawer';
 *
 * createElement(Drawer, { defaultOpen: true });
 * ```
 */
function Drawer({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Root>): React.JSX.Element {
  return (
    // oxlint-disable-next-line react/jsx-boolean-value -- we want to explicitly set the value to true
    <DrawerContext.Provider value={true}>
      <DrawerPrimitive.Root data-slot='drawer' {...properties} />
    </DrawerContext.Provider>
  );
}

/**
 * Creates a drawer nested inside another drawer.
 *
 * @public
 * @example <caption>Render a nested drawer root.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerNestedRoot } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerNestedRoot);
 * ```
 */
function DrawerNestedRoot({
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.NestedRoot>): React.JSX.Element {
  return <DrawerPrimitive.NestedRoot data-slot='drawer-nested-root' {...properties} />;
}

/**
 * Opens the nearest drawer when activated.
 *
 * @public
 * @example <caption>Render a drawer trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerTrigger } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerTrigger, null, 'Details');
 * ```
 */
function DrawerTrigger({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Trigger>): React.JSX.Element {
  return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...properties} />;
}

/**
 * Portals drawer content into the document body.
 *
 * @public
 * @example <caption>Render content through the drawer portal.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerPortal } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerPortal, null, createElement('div'));
 * ```
 */
function DrawerPortal({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Portal>): React.JSX.Element {
  return <DrawerPrimitive.Portal data-slot='drawer-portal' {...properties} />;
}

/**
 * Closes the nearest drawer when activated.
 *
 * @public
 * @example <caption>Render a drawer close control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerClose } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerClose, null, 'Done');
 * ```
 */
function DrawerClose({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Close>): React.JSX.Element {
  return <DrawerPrimitive.Close data-slot='drawer-close' {...properties} />;
}

/**
 * Supplies Vaul's draggable drawer handle.
 *
 * @public
 * @example <caption>Render a drawer handle.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerHandle } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerHandle);
 * ```
 */
function DrawerHandle({ ...properties }: React.ComponentProps<typeof DrawerPrimitive.Handle>): React.JSX.Element {
  return <DrawerPrimitive.Handle data-slot='drawer-handle' {...properties} />;
}

function DrawerHandleIndicator({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div className='relative'>
      <DrawerHandle className='absolute! inset-0! m-auto! size-full! opacity-0!' />
      <div
        data-slot='drawer-handle-indicator'
        className={cn(
          'relative mx-auto mt-1 hidden h-1 w-[60px] shrink-0 rounded-full bg-accent group-data-[vaul-drawer-direction=bottom]/drawer-content:block',
          className,
        )}
        {...properties}
      />
    </div>
  );
}

/**
 * Dims the page behind an open drawer.
 *
 * @public
 * @example <caption>Render the drawer overlay.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerOverlay } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerOverlay);
 * ```
 */
function DrawerOverlay({
  className,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>): React.JSX.Element {
  return (
    <DrawerPrimitive.Overlay
      data-slot='drawer-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders the draggable drawer surface.
 *
 * @public
 * @example <caption>Render drawer content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerContent } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerContent, null, 'Project details');
 * ```
 */
function DrawerContent({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Content>): React.JSX.Element {
  return (
    <DrawerPortal data-slot='drawer-portal'>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot='drawer-content'
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col bg-background',
          'select-none',
          'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t',
          'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm',
          'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm',
          className,
        )}
        {...properties}
      >
        <DrawerHandleIndicator />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

/**
 * Groups a drawer title and description.
 *
 * @public
 * @example <caption>Render a drawer header.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerHeader } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerHeader, null, 'Project details');
 * ```
 */
function DrawerHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='drawer-header' className={cn('flex flex-col gap-1.5 p-4', className)} {...properties} />;
}

/**
 * Aligns actions at the bottom of a drawer.
 *
 * @public
 * @example <caption>Render a drawer footer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerFooter } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerFooter, null, 'Actions');
 * ```
 */
function DrawerFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='drawer-footer' className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...properties} />;
}

/**
 * Provides the accessible name for a drawer.
 *
 * @public
 * @example <caption>Name a drawer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerTitle } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerTitle, null, 'Project details');
 * ```
 */
function DrawerTitle({
  className,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Title>): React.JSX.Element {
  return (
    <DrawerPrimitive.Title
      data-slot='drawer-title'
      className={cn('font-semibold text-foreground', className)}
      {...properties}
    />
  );
}

/**
 * Provides supporting text for a drawer.
 *
 * @public
 * @example <caption>Describe a drawer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DrawerDescription } from '@taucad/ui/components/drawer';
 *
 * createElement(DrawerDescription, null, 'Inspect project metadata.');
 * ```
 */
function DrawerDescription({
  className,
  ...properties
}: React.ComponentProps<typeof DrawerPrimitive.Description>): React.JSX.Element {
  return (
    <DrawerPrimitive.Description
      data-slot='drawer-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...properties}
    />
  );
}

export {
  Drawer,
  DrawerNestedRoot,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerHandle,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  useIsInsideDrawer,
};
