import { Menu, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { defaultFilter } from 'cmdk';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Fragment } from 'react/jsx-runtime';
import { useNavigate } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandItem } from '@taucad/ui/components/command';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { menuGroupHeadingClass, menuItemLayoutClass } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';
import { useTypedMatches } from '#hooks/use-typed-matches.js';
import { SidebarMenuButton } from '#components/ui/sidebar.js';

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
  | { readonly kind: 'item'; readonly key: string; readonly item: CommandPaletteItem };

/**
 * Ranks items the way cmdk would — drop non-matches, then order each group and the
 * groups by best score — so the list only mounts the rows in view instead of handing
 * cmdk every item to filter.
 * @param items - Every registered palette item.
 * @param search - The current query; empty keeps registration order.
 * @returns Flat heading and item rows for the virtualized list.
 */
export function rankCommandPaletteRows(items: readonly CommandPaletteItem[], search: string): CommandPaletteRow[] {
  const groups = new Map<string, { score: number; matches: Array<{ item: CommandPaletteItem; score: number }> }>();

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
        .map(({ item }): CommandPaletteRow => ({ kind: 'item', key: item.id, item })),
    ]);
}

type CommandPaletteResultsProperties = {
  readonly items: CommandPaletteItem[];
  readonly onRun: (item: CommandPaletteItem) => void;
};

/** Mounted only while the dialog is open, so the query resets on every open. */
function CommandPaletteResults({ items, onRun }: CommandPaletteResultsProperties): React.JSX.Element {
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
      return row?.kind === 'item' ? (row.item.detail ? 46 : 30) : 24;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
  });

  return (
    <>
      <CommandInput
        className='h-9 border-0 bg-transparent px-3 text-base shadow-none focus-visible:outline-none dark:bg-transparent'
        placeholder='Search projects, chats, and actions...'
        value={search}
        onValueChange={(value) => {
          setSearch(value);
          virtualizer.scrollToOffset(0);
        }}
      />
      <CommandList ref={listRef} className='py-0'>
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

type CommandPaletteProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly items: CommandPaletteItem[];
};

function CommandPalette({ isOpen, onOpenChange, items }: CommandPaletteProperties): React.JSX.Element {
  const navigate = useNavigate();

  const runCommand = useCallback(
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

  return (
    <CommandDialog
      open={isOpen}
      shouldFilter={false}
      onOpenChange={onOpenChange}
      contentClassName='*:data-[slot=dialog-close]:hidden [&_[data-slot=command-input-wrapper]>svg]:hidden'
    >
      <CommandPaletteResults items={items} onRun={runCommand} />
    </CommandDialog>
  );
}

const commandKeyCombination = {
  key: 'k',
  modKey: true,
} as const satisfies KeyCombination;

type CommandPaletteTriggerProperties = {
  readonly items: CommandPaletteItem[];
};

function CommandPaletteTrigger({ items }: CommandPaletteTriggerProperties): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const { formattedKeyCombination } = useKeybinding(commandKeyCombination, () => {
    setOpen((previous) => !previous);
  });

  return (
    <>
      <SidebarMenuButton
        variant='outline'
        aria-label='Search'
        className='text-muted-foreground max-md:hidden'
        onClick={() => {
          setOpen(true);
        }}
      >
        <Search aria-hidden className='size-4 shrink-0' />
        <span className='flex-1 whitespace-nowrap'>Search</span>
        <KeyShortcut className='ml-2 shrink-0'>{formattedKeyCombination}</KeyShortcut>
      </SidebarMenuButton>
      <CommandPalette isOpen={open} items={items} onOpenChange={setOpen} />
    </>
  );
}

type CommandPaletteMobileProperties = {
  readonly items: CommandPaletteItem[];
};

function CommandPaletteMobile({ items }: CommandPaletteMobileProperties): React.JSX.Element {
  const navigate = useNavigate();

  const groupedItems = useMemo(() => {
    const groupsMap: Record<string, { name: string; items: CommandPaletteItem[] }> = {};
    const groupOrder: string[] = [];

    for (const item of items) {
      if (item.visible === false) {
        continue;
      }

      if (!groupsMap[item.group]) {
        groupsMap[item.group] = { name: item.group, items: [] };
        groupOrder.push(item.group);
      }

      groupsMap[item.group]!.items.push(item);
    }

    return Object.values(groupsMap).sort((a, b) => groupOrder.indexOf(a.name) - groupOrder.indexOf(b.name));
  }, [items]);

  const renderItemLabel = useCallback(
    (item: CommandPaletteItem, _selectedItem: CommandPaletteItem | undefined) => (
      <CommandPaletteItemLabel item={item} />
    ),
    [],
  );

  const getItemValue = useCallback((item: CommandPaletteItem) => commandValue(item), []);
  const isItemDisabled = useCallback((item: CommandPaletteItem) => Boolean(item.disabled), []);

  return (
    <Tooltip>
      <ComboBoxResponsive<CommandPaletteItem>
        groupedItems={groupedItems}
        renderLabel={renderItemLabel}
        getValue={getItemValue}
        isDisabled={isItemDisabled}
        withVirtualization
        searchPlaceHolder='Search projects, chats, and actions...'
        placeholder='Actions'
        title='Search projects, chats, and actions'
        description='Navigate to any project or chat, or run an available action.'
        onSelect={(itemValue) => {
          const selectedItem = items.find((item) => getItemValue(item) === itemValue);
          if (selectedItem) {
            if (selectedItem.link) {
              void navigate(selectedItem.link);
            } else if (selectedItem.action) {
              selectedItem.action();
            }
          }
        }}
      >
        <TooltipTrigger asChild>
          <Button variant='overlay' size='icon' className='text-muted-foreground md:hidden'>
            <Menu className='size-4' />
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>More actions</TooltipContent>
    </Tooltip>
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
 * Sidebar search entry point: the palette trigger over every registered item.
 * @returns The palette trigger and its mobile equivalent.
 */
export function Commands(): React.JSX.Element | undefined {
  const allItems = useContext(CommandPaletteItemsContext);

  return allItems.length > 0 ? (
    <div className='flex items-center gap-2'>
      <CommandPaletteTrigger items={allItems} />
      <CommandPaletteMobile items={allItems} />
    </div>
  ) : undefined;
}
