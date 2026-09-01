import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';
import { buttonVariants } from '#components/button.js';

/**
 * Owns state and focus for a modal confirmation dialog.
 *
 * @public
 * @example <caption>Open a confirmation dialog.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialog } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialog, { defaultOpen: true });
 * ```
 */
function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>): React.JSX.Element {
  return <AlertDialogPrimitive.Root data-slot='alert-dialog' {...props} />;
}

/**
 * Opens the nearest alert dialog when activated.
 *
 * @public
 * @example <caption>Render a confirmation trigger.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogTrigger } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogTrigger, null, 'Delete');
 * ```
 */
function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>): React.JSX.Element {
  return <AlertDialogPrimitive.Trigger data-slot='alert-dialog-trigger' {...props} />;
}

/**
 * Portals alert-dialog content into the document body.
 *
 * @public
 * @example <caption>Render content through the alert-dialog portal.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogPortal } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogPortal, null, createElement('div'));
 * ```
 */
function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>): React.JSX.Element {
  return <AlertDialogPrimitive.Portal data-slot='alert-dialog-portal' {...props} />;
}

/**
 * Dims the page behind an open alert dialog.
 *
 * @public
 * @example <caption>Render the alert-dialog overlay.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogOverlay } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogOverlay);
 * ```
 */
function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot='alert-dialog-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders the modal confirmation surface.
 *
 * @public
 * @example <caption>Render confirmation content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogContent } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogContent, null, 'Delete this project?');
 * ```
 */
function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>): React.JSX.Element {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot='alert-dialog-content'
        className={cn(
          'shadow-lg fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

/**
 * Groups an alert-dialog title and description.
 *
 * @public
 * @example <caption>Render a confirmation header.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogHeader } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogHeader, null, 'Delete project');
 * ```
 */
function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='alert-dialog-header'
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

/**
 * Aligns confirmation actions at the bottom of the dialog.
 *
 * @public
 * @example <caption>Render confirmation actions.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogFooter } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogFooter, null, 'Actions');
 * ```
 */
function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='alert-dialog-footer'
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

/**
 * Provides the accessible name for an alert dialog.
 *
 * @public
 * @example <caption>Name a confirmation dialog.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogTitle } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogTitle, null, 'Delete project');
 * ```
 */
function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Title
      data-slot='alert-dialog-title'
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  );
}

/**
 * Provides supporting text for an alert dialog.
 *
 * @public
 * @example <caption>Describe a confirmation.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogDescription } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogDescription, null, 'This action cannot be undone.');
 * ```
 */
function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Description
      data-slot='alert-dialog-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * Holds an illustration or icon for an alert dialog.
 *
 * @public
 * @example <caption>Render alert-dialog media.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogMedia } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogMedia, null, '!');
 * ```
 */
function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='alert-dialog-media'
      className={cn('mb-4 flex size-12 items-center justify-center rounded-full bg-muted', className)}
      {...props}
    />
  );
}

/**
 * Confirms an alert-dialog action and closes the dialog.
 *
 * @public
 * @example <caption>Render a destructive confirmation.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogAction } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogAction, null, 'Delete');
 * ```
 */
function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>): React.JSX.Element {
  return <AlertDialogPrimitive.Action className={cn(buttonVariants(), className)} {...props} />;
}

/**
 * Cancels an alert-dialog action and closes the dialog.
 *
 * @public
 * @example <caption>Render a confirmation cancel action.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AlertDialogCancel } from '@taucad/ui/components/alert-dialog';
 *
 * createElement(AlertDialogCancel, null, 'Cancel');
 * ```
 */
function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>): React.JSX.Element {
  return <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />;
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogMedia,
  AlertDialogAction,
  AlertDialogCancel,
};
