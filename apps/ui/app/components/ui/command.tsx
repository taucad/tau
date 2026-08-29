import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';
import { cn } from '#utils/ui.utils.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#components/ui/dialog.js';
import { emptyItemVariants } from '#components/ui/empty-items.js';
import { menuItemVariants, menuSeparatorVariants, menuShortcutClass } from '#components/ui/menu.variants.js';

function Command({ className, ...properties }: React.ComponentProps<typeof CommandPrimitive>): React.JSX.Element {
  return (
    <CommandPrimitive
      data-slot='command'
      className={cn('flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground', className)}
      {...properties}
    />
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  ...properties
}: React.ComponentProps<typeof Dialog> & {
  readonly title?: string;
  readonly description?: string;
}): React.JSX.Element {
  return (
    <Dialog {...properties}>
      <DialogHeader className='sr-only'>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent className='overflow-hidden p-0 *:data-[slot=dialog-close]:top-2.5 *:data-[slot=dialog-close]:right-2.5'>
        <Command className='[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:size-4'>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...properties
}: React.ComponentProps<typeof CommandPrimitive.Input>): React.JSX.Element {
  return (
    <div data-slot='command-input-wrapper' className='relative flex items-center p-2'>
      <SearchIcon className='pointer-events-none absolute top-1/2 left-4 size-4 shrink-0 -translate-y-1/2 opacity-50' />
      <CommandPrimitive.Input
        data-slot='command-input'
        className={cn(
          'flex h-7 w-full min-w-0 rounded-md border border-input bg-background py-1 pr-2 pl-8 text-sm shadow-xs transition-[box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          'focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...properties}
      />
    </div>
  );
}

function CommandList({
  className,
  ...properties
}: React.ComponentProps<typeof CommandPrimitive.List>): React.JSX.Element {
  return (
    <CommandPrimitive.List
      data-slot='command-list'
      className={cn('flex max-h-[400px] flex-col gap-0.5 overflow-x-hidden overflow-y-auto', className)}
      {...properties}
    />
  );
}

function CommandEmpty({
  className,
  ...properties
}: React.ComponentProps<typeof CommandPrimitive.Empty>): React.JSX.Element {
  return (
    <CommandPrimitive.Empty
      data-slot='command-empty'
      className={cn(emptyItemVariants({ variant: 'default' }), className)}
      {...properties}
    />
  );
}

function CommandGroup({
  className,
  ...properties
}: React.ComponentProps<typeof CommandPrimitive.Group>): React.JSX.Element {
  return (
    <CommandPrimitive.Group
      data-slot='command-group'
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-0.5',
        className,
      )}
      {...properties}
    />
  );
}

function CommandSeparator({
  className,
  ...properties
}: React.ComponentProps<typeof CommandPrimitive.Separator>): React.JSX.Element {
  return (
    <CommandPrimitive.Separator
      data-slot='command-separator'
      className={cn(menuSeparatorVariants(), className)}
      {...properties}
    />
  );
}

function CommandItem({
  className,
  ...properties
}: React.ComponentProps<typeof CommandPrimitive.Item>): React.JSX.Element {
  return (
    <CommandPrimitive.Item
      data-slot='command-item'
      className={cn(
        menuItemVariants({ highlight: 'selected' }),
        // Cmdk sets data-disabled="false" on ALL non-disabled items, but Tailwind's data-disabled: matches bare attribute presence.
        // Reset base data-disabled: styles, then re-apply only for truly disabled items via data-[disabled=true]:
        'data-disabled:pointer-events-auto data-disabled:text-inherit data-disabled:opacity-100 data-[disabled=true]:pointer-events-none data-[disabled=true]:text-muted-foreground/50 data-[disabled=true]:opacity-50',
        className,
      )}
      {...properties}
    />
  );
}

function CommandShortcut({ className, ...properties }: React.ComponentProps<'span'>): React.JSX.Element {
  return <span data-slot='command-shortcut' className={cn(menuShortcutClass, className)} {...properties} />;
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
