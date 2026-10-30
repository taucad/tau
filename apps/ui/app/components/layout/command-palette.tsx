import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { defaultFilter } from 'cmdk';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Fragment } from 'react/jsx-runtime';
import { useNavigate } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@taucad/ui/components/command';
import {
  Drawer,
  DrawerAction,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@taucad/ui/components/drawer';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import type { KeyCombination } from '@taucad/ui/utils/keys';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { menuGroupHeadingClass, menuItemLayoutClass } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';
import { useTypedMatches } from '#hooks/use-typed-matches.js';
import { SidebarMenuButton, useSidebar } from '#components/ui/sidebar.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { ProjectNavigationCommandItems } from '#components/nav/project-navigation-command-items.js';

/**
 * Context for command palette item registration
 */
type CommandPaletteContextValue = {
  registerItems: (id: string, items: CommandPaletteItem[]) => void;
  unregisterItems: (id: string) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

/*
 * The aggregated items ride a second context so registering never changes the
 * registration context's identity: `useCommandPaletteItems` lists that identity
 * as an effect dependency, so sharing one context would re-run the effect on
 * every registration and register forever.
 */
const CommandPaletteItemsContext = createContext<CommandPaletteItem[]>([]);

/**
 * Hook for creating and registering command palette items
 * @param matchId - Unique identifier for this registration (typically match.id from the route)
 * @param factory - Function that creates the command palette items
 * @param dependencies - Dependencies array for memoization
 */
export function useCommandPaletteItems(
  matchId: string,
  factory: () => CommandPaletteItem[],
  dependencies: React.DependencyList,
): void {
  const context = useContext(CommandPaletteContext);

  if (!context) {
    throw new Error('useCommandPaletteItems must be used within CommandPaletteProvider');
  }

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- dependencies are provided by caller
  const items = useMemo(factory, dependencies);

  useEffect(() => {
    context.registerItems(matchId, items);
    return () => {
      context.unregisterItems(matchId);
    };
  }, [context, matchId, items]);
}

export type CommandPaletteItem = {
  id: string;
  label: string;
  /** Muted line under the label that tells similarly named items apart. */
  detail?: string;
  searchValue?: string;
  group: string;
  icon: React.JSX.Element;
  action?: () => void;
  disabled?: boolean;
  shortcut?: string;
  link?: string;
  visible?: boolean;
};

/**
 * The 80 × 60 frame for a project or example image in a search result: the whole 4:3 thumbnail,
 * or `fallback` while there is none.
 */
export function CommandPaletteThumbnail({
  src,
  fallback,
}: {
  readonly src?: string;
  readonly fallback?: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className='flex h-15 w-20 items-center justify-center overflow-hidden rounded-xs bg-muted ring-1 ring-border'>
      {src ? <img src={src} alt='' className='size-full object-contain' /> : fallback}
    </span>
  );
}

function CommandPaletteItemLabel({ item }: { readonly item: CommandPaletteItem }): React.JSX.Element {
  return (
    <div className={cn(menuItemLayoutClass, 'min-w-0')}>
      <span className='shrink-0'>{item.icon}</span>
      {item.detail ? (
        <div className='flex min-w-0 flex-col'>
          <span className='truncate'>{item.label}</span>
          <span className='truncate text-xs text-muted-foreground'>{item.detail}</span>
        </div>
      ) : (
        <span>{item.label}</span>
      )}
    </div>
  );
}

const commandValue = (item: CommandPaletteItem): string => `${item.searchValue ?? item.label} ${item.id}`;

type CommandPaletteRow =
  | { readonly kind: 'heading'; readonly key: string; readonly group: string }
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly item: CommandPaletteItem;
    };

/**
 * Ranks items the way cmdk would — drop non-matches, then order each group and the
 * groups by best score — so the list only mounts the rows in view instead of handing
 * cmdk every item to filter.
 * @param items - Every registered palette item.
 * @param search - The current query; empty keeps registration order.
 * @returns Flat heading and item rows for the virtualized list.
 */
export function rankCommandPaletteRows(items: readonly CommandPaletteItem[], search: string): CommandPaletteRow[] {
  const groups = new Map<
    string,
    {
      score: number;
      matches: Array<{ item: CommandPaletteItem; score: number }>;
    }
  >();

  for (const item of items) {
    if (item.visible === false) {
      continue;
    }
    const score = search ? (defaultFilter?.(commandValue(item), search) ?? 0) : 1;
    if (score <= 0) {
      continue;
    }
    const group = groups.get(item.group) ?? { score: 0, matches: [] };
    group.matches.push({ item, score });
    group.score = Math.max(group.score, score);
    groups.set(item.group, group);
  }

  return [...groups]
    .sort(([, left], [, right]) => right.score - left.score)
    .flatMap(([name, group]): CommandPaletteRow[] => [
      { kind: 'heading', key: `group-${name}`, group: name },
      ...group.matches
        .sort((left, right) => right.score - left.score)
        .map(
          ({ item }): CommandPaletteRow => ({
            kind: 'item',
            key: item.id,
            item,
          }),
        ),
    ]);
}

type CommandPaletteResultsProperties = {
  readonly items: CommandPaletteItem[];
  readonly onRun: (item: CommandPaletteItem) => void;
  /** Sizes the result list; the dialog keeps the list's own maximum height. */
  readonly listClassName?: string;
  /** A control on the field's row, after the field so the field stays the first stop. */
  readonly inputAction?: React.ReactNode;
  /** The field's placeholder; a phone's narrower row takes a shorter one, so it is never cut off. */
  readonly placeholder?: string;
};

/** Mounted only while the dialog is open, so the query resets on every open. */
export function CommandPaletteResults({
  items,
  onRun,
  listClassName,
  inputAction,
  placeholder = 'Search projects, chats, and actions…',
}: CommandPaletteResultsProperties): React.JSX.Element {
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => rankCommandPaletteRows(items, search), [items, search]);

  /*
   * Rows mount only around the viewport. The item overscan also keeps the next rows
   * mounted, because cmdk's arrow keys can only move to an item that is in the DOM.
   */
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual returns mutable functions that cannot be compiler-memoized safely.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      // Detailed rows are projects and examples, which lead with a 60 px tall thumbnail.
      return row?.kind === 'item' ? (row.item.detail ? 68 : 30) : 24;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
  });

  const input = (
    <CommandInput
      className='h-9 border-0 bg-transparent px-3 text-base text-ellipsis shadow-none focus-visible:outline-none dark:bg-transparent'
      placeholder={placeholder}
      value={search}
      onValueChange={(value) => {
        setSearch(value);
        virtualizer.scrollToOffset(0);
      }}
    />
  );

  return (
    <>
      {inputAction ? (
        <>
          {/* The drawer header: the field where a title sits, the action at the shared 60px bar's end. */}
          <div className='flex min-h-(--drawer-bar-height) shrink-0 items-center gap-2 py-2 pr-4 [&_[data-slot=command-input-wrapper]]:min-w-0 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]>svg]:hidden'>
            {input}
            {inputAction}
          </div>
          <div aria-hidden className='mx-4 h-px shrink-0 bg-border' />
        </>
      ) : (
        input
      )}
      <CommandList ref={listRef} className={cn('py-0', listClassName)}>
        {rows.length === 0 ? <CommandEmpty>No results found.</CommandEmpty> : null}
        <div className='relative w-full' style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return row ? (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className={cn('absolute inset-x-0 top-0 px-1', row.kind === 'heading' ? 'pt-1' : 'pb-0.5')}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.kind === 'heading' ? (
                  <div className={menuGroupHeadingClass}>{row.group}</div>
                ) : (
                  <CommandItem
                    value={commandValue(row.item)}
                    disabled={row.item.disabled}
                    onSelect={() => {
                      onRun(row.item);
                    }}
                  >
                    <CommandPaletteItemLabel item={row.item} />
                    {row.item.shortcut ? <KeyShortcut className='ml-auto'>{row.item.shortcut}</KeyShortcut> : null}
                  </CommandItem>
                )}
              </div>
            ) : null;
          })}
        </div>
      </CommandList>
    </>
  );
}

/**
 * Closes the palette, then follows the item's link or runs its action.
 * @param onOpenChange - The palette's open setter.
 * @returns The handler for a picked item.
 */
function useRunCommand(onOpenChange: (isOpen: boolean) => void): (item: CommandPaletteItem) => void {
  const navigate = useNavigate();

  return useCallback(
    (item: CommandPaletteItem) => {
      onOpenChange(false);
      if (item.link) {
        void navigate(item.link);
      } else if (!item.disabled && item.action) {
        item.action();
      }
    },
    [navigate, onOpenChange],
  );
}

type CommandPaletteProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly items: CommandPaletteItem[];
};

/** Runs `onUnmount` when the dialog content leaves, after its exit animation. */
function OnContentUnmount({ onUnmount }: { readonly onUnmount: () => void }): undefined {
  useEffect(() => onUnmount, [onUnmount]);
  return undefined;
}

type CommandPaletteDialogProperties = CommandPaletteProperties & {
  readonly onContentUnmount: () => void;
};

function CommandPalette({
  isOpen,
  onOpenChange,
  items,
  onContentUnmount,
}: CommandPaletteDialogProperties): React.JSX.Element {
  const runCommand = useRunCommand(onOpenChange);

  return (
    <CommandDialog
      open={isOpen}
      shouldFilter={false}
      onOpenChange={onOpenChange}
      contentClassName='*:data-[slot=dialog-close]:hidden [&_[data-slot=command-input-wrapper]>svg]:hidden'
    >
      <OnContentUnmount onUnmount={onContentUnmount} />
      <CommandPaletteResults items={items} onRun={runCommand} />
    </CommandDialog>
  );
}

const commandKeyCombination = {
  key: 'k',
  modKey: true,
} as const satisfies KeyCombination;

type CommandPaletteTriggerProperties = CommandPaletteProperties & {
  readonly formattedKeyCombination: string;
};

/** The wide-screen trigger: a labelled Search row with its shortcut, opening the palette dialog. */
function CommandPaletteTrigger({
  isOpen,
  onOpenChange,
  items,
  formattedKeyCombination,
}: CommandPaletteTriggerProperties): React.JSX.Element {
  /*
   * `CommandDialog` has no Radix trigger, so on close it would leave focus on the page body. The
   * opener is the Search row, or whatever had focus when the shortcut fired.
   */
  const opener = useRef<HTMLElement | undefined>(undefined);

  /* Layout effects run before the dialog's focus scope moves focus into the field. */
  useLayoutEffect(() => {
    if (isOpen && !opener.current && document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement;
    }
  }, [isOpen]);

  const returnFocus = useCallback(() => {
    const element = opener.current;
    opener.current = undefined;
    // After the focus scope's own unmount handling; focus an item's action moved elsewhere stays there.
    setTimeout(() => {
      const isFocusLost = !document.activeElement || document.activeElement === document.body;
      if (isFocusLost && element?.isConnected) {
        element.focus();
      }
    }, 0);
  }, []);

  return (
    <>
      <SidebarMenuButton
        variant='outline'
        aria-label='Search'
        className='text-muted-foreground max-md:hidden'
        onClick={(event) => {
          // Safari does not focus a clicked button, so name the row as the opener rather than reading focus.
          opener.current = event.currentTarget;
          onOpenChange(true);
        }}
      >
        <Search aria-hidden className='size-4 shrink-0' />
        <span className='flex-1 whitespace-nowrap'>Search</span>
        <KeyShortcut className='ml-2 shrink-0'>{formattedKeyCombination}</KeyShortcut>
      </SidebarMenuButton>
      <CommandPalette isOpen={isOpen} items={items} onContentUnmount={returnFocus} onOpenChange={onOpenChange} />
    </>
  );
}

type CommandPaletteMobileProperties = CommandPaletteTriggerProperties & {
  readonly size: 'icon-lg' | 'icon-sm';
};

/**
 * The phone trigger: a Search icon at the end of the sidebar sheet header, opening the palette as a
 * full-height sheet with the field focused. The sheet sits above the sidebar sheet (z-100) it opens from.
 */
function CommandPaletteMobile({
  isOpen,
  onOpenChange,
  items,
  formattedKeyCombination,
  size,
}: CommandPaletteMobileProperties): React.JSX.Element {
  const runCommand = useRunCommand(onOpenChange);

  return (
    <Drawer autoFocus open={isOpen} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DrawerTrigger asChild>
            <Button variant='ghost' size={size} aria-label='Search' className='shrink-0 text-muted-foreground'>
              <Search aria-hidden className='size-4' />
            </Button>
          </DrawerTrigger>
        </TooltipTrigger>
        {/* Above the sidebar sheet (z-100) this button sits in. */}
        <TooltipContent className='z-110'>
          Search{' '}
          <KeyShortcut className='ml-1' variant='tooltip'>
            {formattedKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <DrawerContent
        data-slot='command-palette-sheet'
        className={cn(
          // Below the status bar with a sliver of page above, so its rounded top reads as a drawer like the others.
          'z-110 h-[calc(100dvh-env(safe-area-inset-top)-var(--spacing)*3)]',
          'data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-env(safe-area-inset-top)-var(--spacing)*3)]',
        )}
      >
        <DrawerTitle className='sr-only'>Search</DrawerTitle>
        <DrawerDescription className='sr-only'>
          Navigate to any project or chat, or run an available action.
        </DrawerDescription>
        <Command shouldFilter={false} className='min-h-0 flex-1 bg-transparent'>
          <CommandPaletteResults
            items={items}
            listClassName='max-h-none min-h-0 flex-1'
            // Beside the close at 320 px the full placeholder needs 263 px of the field's width.
            placeholder='Search projects, chats…'
            inputAction={
              <DrawerClose asChild>
                <DrawerAction aria-label='Close'>
                  <X aria-hidden className='size-4' />
                </DrawerAction>
              </DrawerClose>
            }
            onRun={runCommand}
          />
        </Command>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Owns the palette registry for the whole page.
 *
 * It sits above both the sidebar — which renders the trigger — and the composed
 * route providers, so a route's items can register from inside its own
 * providers (see `RouteCommandPaletteItems`).
 * @param properties - The subtree that registers and consumes palette items.
 * @returns The registry provider.
 */
export function CommandPaletteProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [itemsMap, setItemsMap] = useState<Map<string, CommandPaletteItem[]>>(new Map());

  const contextValue = useMemo(
    () => ({
      registerItems(id: string, newItems: CommandPaletteItem[]) {
        setItemsMap((previous) => new Map(previous).set(id, newItems));
      },
      unregisterItems(id: string) {
        setItemsMap((previous) => {
          const next = new Map(previous);
          next.delete(id);
          return next;
        });
      },
    }),
    [],
  );

  // Aggregate all items (sort by route depth to show child route commands first)
  const allItems = useMemo(() => {
    // Create array of [matchId, items] pairs to preserve route information
    const entries = [...itemsMap.entries()];

    // Sort by match ID depth (number of slashes in route ID) to ensure child routes render first
    entries.sort(([idA], [idB]) => {
      const depthA = (idA.match(/\//g) ?? []).length;
      const depthB = (idB.match(/\//g) ?? []).length;
      return depthB - depthA; // Descending order - deeper paths first
    });

    // Flatten to get final items array
    return entries.flatMap(([, items]) => items);
  }, [itemsMap]);

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      <CommandPaletteItemsContext.Provider value={allItems}>{children}</CommandPaletteItemsContext.Provider>
    </CommandPaletteContext.Provider>
  );
}

/**
 * Registers the matched routes' command palette items.
 *
 * These are invisible components, but they read their own route's context — the
 * project items need `ProjectProvider` — so they render inside the composed
 * route providers rather than beside the trigger in the sidebar.
 * @returns The matched routes' registration components.
 */
export function RouteCommandPaletteItems(): React.JSX.Element {
  const commandPaletteMatches = useTypedMatches((handles) => handles.commandPalette);

  return (
    <>
      {commandPaletteMatches.map((match) => (
        <Fragment key={match.id}>{match.handle.commandPalette?.(match)}</Fragment>
      ))}
    </>
  );
}

/**
 * Sidebar search entry point: one palette over every registered item, opened by its trigger or the
 * shortcut. Wide screens get the labelled Search row and the palette dialog; the phone sidebar sheet
 * gets a Search icon for its header and the palette as a full-height sheet.
 * @returns The palette trigger for the current layout.
 */
export function Commands(): React.JSX.Element {
  const allItems = useContext(CommandPaletteItemsContext);
  const { isMobile } = useSidebar();
  const [open, setOpen] = useState(false);

  const { formattedKeyCombination } = useKeybinding(
    commandKeyCombination,
    () => {
      setOpen((previous) => !previous);
    },
    // Search is the phone sidebar sheet's own control, so its shortcut works inside that dialog.
    { allowedScopes: ['sidebar'] },
  );

  return (
    <>
      {open ? <ProjectNavigationCommandItems /> : null}
      {isMobile ? (
        <CommandPaletteMobile
          isOpen={open}
          items={allItems}
          formattedKeyCombination={formattedKeyCombination}
          size={isDesktopTarget() ? 'icon-sm' : 'icon-lg'}
          onOpenChange={setOpen}
        />
      ) : (
        <div className='flex items-center gap-2'>
          <CommandPaletteTrigger
            isOpen={open}
            items={allItems}
            formattedKeyCombination={formattedKeyCombination}
            onOpenChange={setOpen}
          />
        </div>
      )}
    </>
  );
}
