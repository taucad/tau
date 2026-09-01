import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#components/dialog.js';
import { menuItemVariants, menuSeparatorVariants, menuShortcutClass } from '#components/menu.variants.js';

type PrimitiveDivProps = React.ComponentPropsWithRef<'div'> & { readonly asChild?: boolean };
type CommandProps = PrimitiveDivProps &
  Partial<Record<'loop' | 'disablePointerSelection' | 'vimBindings', boolean>> & {
    readonly label?: string;
    readonly shouldFilter?: boolean;
    readonly filter?: (value: string, search: string, keywords?: string[]) => number;
    readonly defaultValue?: string;
    readonly value?: string;
    readonly onValueChange?: (value: string) => void;
  };
type CommandInputProps = Omit<React.ComponentPropsWithRef<'input'>, 'onChange' | 'type' | 'value'> & {
  readonly asChild?: boolean;
  readonly value?: string;
  readonly onValueChange?: (search: string) => void;
};
type CommandListProps = PrimitiveDivProps & { readonly label?: string };
type CommandGroupProps = PrimitiveDivProps &
  Partial<Record<'forceMount', boolean>> & {
    readonly heading?: React.ReactNode;
    readonly value?: string;
  };
type CommandSeparatorProps = PrimitiveDivProps & Partial<Record<'alwaysRender', boolean>>;
type CommandItemProps = Omit<PrimitiveDivProps, 'onSelect'> &
  Partial<Record<'disabled' | 'forceMount', boolean>> & {
    readonly onSelect?: (value: string) => void;
    readonly value?: string;
    readonly keywords?: string[];
  };

/**
 * Provides a searchable command collection with roving keyboard focus.
 *
 * @public
 * @example <caption>Render a command palette.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Command } from '@taucad/ui/components/command';
 *
 * createElement(Command);
 * ```
 */
function Command({ className, ...properties }: CommandProps): React.JSX.Element {
  return (
    <CommandPrimitive
      data-slot='command'
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-[inherit] bg-popover text-popover-foreground',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Presents a {@link Command} collection in a modal dialog.
 *
 * @public
 * @example <caption>Open a command dialog.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CommandDialog } from '@taucad/ui/components/command';
 *
 * createElement(CommandDialog, { defaultOpen: true, title: 'Navigate' });
 * ```
 */
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

/**
 * Filters command items as the user types.
 *
 * @public
 * @example <caption>Render a command search field.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Command, CommandInput } from '@taucad/ui/components/command';
 *
 * createElement(Command, null, createElement(CommandInput, { placeholder: 'Search commands' }));
 * ```
 */
function CommandInput({ className, ...properties }: CommandInputProps): React.JSX.Element {
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

/**
 * Provides the scrollable container for command results.
 *
 * @public
 * @example <caption>Render a command result list.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Command, CommandList } from '@taucad/ui/components/command';
 *
 * createElement(Command, null, createElement(CommandList));
 * ```
 */
function CommandList({ className, ...properties }: CommandListProps): React.JSX.Element {
  return (
    <CommandPrimitive.List
      data-slot='command-list'
      className={cn('flex max-h-[400px] flex-col gap-0.5 overflow-x-hidden overflow-y-auto', className)}
      {...properties}
    />
  );
}

/**
 * Displays feedback when no command matches the query.
 *
 * @public
 * @example <caption>Render an empty command state.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CommandEmpty } from '@taucad/ui/components/command';
 *
 * createElement(CommandEmpty, null, 'No results');
 * ```
 */
function CommandEmpty({ className, ...properties }: PrimitiveDivProps): React.JSX.Element {
  return (
    <CommandPrimitive.Empty
      data-slot='command-empty'
      className={cn(
        'm-2 flex h-full flex-col items-center justify-center rounded-xs border border-dashed px-2 py-4 text-center text-sm text-muted-foreground',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Groups related command items under an optional heading.
 *
 * @public
 * @example <caption>Render a named command group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CommandGroup } from '@taucad/ui/components/command';
 *
 * createElement(CommandGroup, { heading: 'File' });
 * ```
 */
function CommandGroup({ className, ...properties }: CommandGroupProps): React.JSX.Element {
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

/**
 * Visually separates command groups.
 *
 * @public
 * @example <caption>Render a command separator.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CommandSeparator } from '@taucad/ui/components/command';
 *
 * createElement(CommandSeparator);
 * ```
 */
function CommandSeparator({ className, ...properties }: CommandSeparatorProps): React.JSX.Element {
  return (
    <CommandPrimitive.Separator
      data-slot='command-separator'
      className={cn(menuSeparatorVariants(), className)}
      {...properties}
    />
  );
}

/**
 * Represents one selectable command result.
 *
 * @public
 * @example <caption>Render a command item.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CommandItem } from '@taucad/ui/components/command';
 *
 * createElement(CommandItem, { value: 'new-file' }, 'New file');
 * ```
 */
function CommandItem({ className, ...properties }: CommandItemProps): React.JSX.Element {
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

/**
 * Displays a keyboard shortcut beside a command item.
 *
 * @public
 * @example <caption>Show a command shortcut.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CommandShortcut } from '@taucad/ui/components/command';
 *
 * createElement(CommandShortcut, null, '⌘K');
 * ```
 */
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
