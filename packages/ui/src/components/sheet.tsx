import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';

/**
 * Owns the open state and focus lifecycle for a side sheet.
 *
 * @public
 * @example <caption>Open a sheet by default.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Sheet } from '@taucad/ui/components/sheet';
 *
 * createElement(Sheet, { defaultOpen: true });
 * ```
 */
function Sheet({ ...properties }: React.ComponentProps<typeof SheetPrimitive.Root>): React.JSX.Element {
  return <SheetPrimitive.Root data-slot='sheet' {...properties} />;
}

/**
 * Opens the nearest sheet when activated.
 *
 * @public
 * @example <caption>Render a sheet trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetTrigger } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetTrigger, null, 'Filters');
 * ```
 */
function SheetTrigger({ ...properties }: React.ComponentProps<typeof SheetPrimitive.Trigger>): React.JSX.Element {
  return <SheetPrimitive.Trigger data-slot='sheet-trigger' {...properties} />;
}

/**
 * Closes the nearest sheet when activated.
 *
 * @public
 * @example <caption>Render a sheet close control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetClose } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetClose, null, 'Done');
 * ```
 */
function SheetClose({ ...properties }: React.ComponentProps<typeof SheetPrimitive.Close>): React.JSX.Element {
  return <SheetPrimitive.Close data-slot='sheet-close' {...properties} />;
}

function SheetPortal({ ...properties }: React.ComponentProps<typeof SheetPrimitive.Portal>): React.JSX.Element {
  return <SheetPrimitive.Portal data-slot='sheet-portal' {...properties} />;
}

function SheetOverlay({
  className,
  ...properties
}: React.ComponentProps<typeof SheetPrimitive.Overlay>): React.JSX.Element {
  return (
    <SheetPrimitive.Overlay
      data-slot='sheet-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders the sheet panel and its close control.
 *
 * @public
 * @example <caption>Render a left-side sheet.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetContent } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetContent, { side: 'left' }, 'Filters');
 * ```
 */
function SheetContent({
  className,
  children,
  side = 'right',
  ...properties
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
}): React.JSX.Element {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot='sheet-content'
        className={cn(
          'shadow-lg fixed z-50 flex flex-col bg-background transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...properties}
      >
        {children}
        <SheetPrimitive.Close className='absolute top-4 right-4 rounded-xs opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none data-[state=open]:bg-secondary'>
          <XIcon className='size-4' />
          <span className='sr-only'>Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

/**
 * Groups a sheet title and description.
 *
 * @public
 * @example <caption>Render a sheet header.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetHeader } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetHeader, null, 'Filters');
 * ```
 */
function SheetHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='sheet-header' className={cn('flex flex-col gap-1.5 p-4', className)} {...properties} />;
}

/**
 * Aligns actions at the bottom of a sheet.
 *
 * @public
 * @example <caption>Render a sheet footer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetFooter } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetFooter, null, 'Actions');
 * ```
 */
function SheetFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='sheet-footer' className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...properties} />;
}

/**
 * Provides the accessible name for a sheet.
 *
 * @public
 * @example <caption>Name a sheet.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetTitle } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetTitle, null, 'Filters');
 * ```
 */
function SheetTitle({
  className,
  ...properties
}: React.ComponentProps<typeof SheetPrimitive.Title>): React.JSX.Element {
  return (
    <SheetPrimitive.Title
      data-slot='sheet-title'
      className={cn('font-semibold text-foreground', className)}
      {...properties}
    />
  );
}

/**
 * Provides supporting text for a sheet.
 *
 * @public
 * @example <caption>Describe a sheet.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { SheetDescription } from '@taucad/ui/components/sheet';
 *
 * createElement(SheetDescription, null, 'Refine the visible projects.');
 * ```
 */
function SheetDescription({
  className,
  ...properties
}: React.ComponentProps<typeof SheetPrimitive.Description>): React.JSX.Element {
  return (
    <SheetPrimitive.Description
      data-slot='sheet-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...properties}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };
