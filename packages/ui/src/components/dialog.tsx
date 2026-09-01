import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';

/**
 * Owns the modal dialog state and focus lifecycle.
 *
 * @public
 * @example <caption>Open a dialog by default.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Dialog } from '@taucad/ui/components/dialog';
 *
 * createElement(Dialog, { defaultOpen: true });
 * ```
 */
function Dialog({ ...properties }: React.ComponentProps<typeof DialogPrimitive.Root>): React.JSX.Element {
  return <DialogPrimitive.Root data-slot='dialog' {...properties} />;
}

/**
 * Opens the nearest {@link Dialog} when activated.
 *
 * @public
 * @example <caption>Render a dialog trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogTrigger } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogTrigger, null, 'Edit');
 * ```
 */
function DialogTrigger({ ...properties }: React.ComponentProps<typeof DialogPrimitive.Trigger>): React.JSX.Element {
  return <DialogPrimitive.Trigger data-slot='dialog-trigger' {...properties} />;
}

/**
 * Portals dialog content into the document body.
 *
 * @public
 * @example <caption>Render content through the dialog portal.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogPortal } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogPortal, null, createElement('div'));
 * ```
 */
function DialogPortal({ ...properties }: React.ComponentProps<typeof DialogPrimitive.Portal>): React.JSX.Element {
  return <DialogPrimitive.Portal data-slot='dialog-portal' {...properties} />;
}

/**
 * Closes the nearest dialog when activated.
 *
 * @public
 * @example <caption>Render a dialog close control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogClose } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogClose, null, 'Cancel');
 * ```
 */
function DialogClose({ ...properties }: React.ComponentProps<typeof DialogPrimitive.Close>): React.JSX.Element {
  return <DialogPrimitive.Close data-slot='dialog-close' {...properties} />;
}

/**
 * Dims the page behind an open dialog.
 *
 * @public
 * @example <caption>Render the standard dialog overlay.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogOverlay } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogOverlay);
 * ```
 */
function DialogOverlay({
  className,
  ...properties
}: React.ComponentProps<typeof DialogPrimitive.Overlay>): React.JSX.Element {
  return (
    <DialogPrimitive.Overlay
      data-slot='dialog-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Renders the modal dialog surface with a visible close control.
 *
 * @public
 * @example <caption>Render dialog content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogContent } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogContent, null, 'Preferences');
 * ```
 */
function DialogContent({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof DialogPrimitive.Content>): React.JSX.Element {
  return (
    <DialogPortal data-slot='dialog-portal'>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot='dialog-content'
        className={cn(
          'shadow-lg fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          className,
        )}
        {...properties}
      >
        {children}
        <DialogPrimitive.Close
          data-slot='dialog-close'
          className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className='sr-only'>Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * Groups a dialog title and description.
 *
 * @public
 * @example <caption>Render a dialog header.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogHeader } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogHeader, null, 'Preferences');
 * ```
 */
function DialogHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='dialog-header'
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...properties}
    />
  );
}

/**
 * Aligns dialog actions at the bottom of the surface.
 *
 * @public
 * @example <caption>Render a dialog footer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogFooter } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogFooter, null, 'Actions');
 * ```
 */
function DialogFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='dialog-footer'
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...properties}
    />
  );
}

/**
 * Provides the accessible name for a dialog.
 *
 * @public
 * @example <caption>Name a dialog.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogTitle } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogTitle, null, 'Preferences');
 * ```
 */
function DialogTitle({
  className,
  ...properties
}: React.ComponentProps<typeof DialogPrimitive.Title>): React.JSX.Element {
  return (
    <DialogPrimitive.Title
      data-slot='dialog-title'
      className={cn('text-lg leading-none font-semibold', className)}
      {...properties}
    />
  );
}

/**
 * Provides supporting text for a dialog.
 *
 * @public
 * @example <caption>Describe a dialog.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { DialogDescription } from '@taucad/ui/components/dialog';
 *
 * createElement(DialogDescription, null, 'Update your settings.');
 * ```
 */
function DialogDescription({
  className,
  ...properties
}: React.ComponentProps<typeof DialogPrimitive.Description>): React.JSX.Element {
  return (
    <DialogPrimitive.Description
      data-slot='dialog-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...properties}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
