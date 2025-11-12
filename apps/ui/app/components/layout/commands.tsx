import { Terminal, Menu } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { Link, useNavigate } from 'react-router';
import { Button } from '#components/ui/button.js';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '#components/ui/command.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useTypedMatches } from '#hooks/use-typed-matches.js';

/**
 * Context for command palette item registration
 */
type CommandPaletteContextValue = {
  registerItems: (id: string, items: CommandPaletteItem[]) => void;
  unregisterItems: (id: string) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies are provided by caller
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
  group: string;
  icon: React.JSX.Element;
  action?: () => void;
  disabled?: boolean;
  shortcut?: string;
  link?: string;
  visible?: boolean;
};

type CommandPaletteProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly items: CommandPaletteItem[];
};

function CommandPalette({ isOpen, onOpenChange, items }: CommandPaletteProperties): React.JSX.Element {
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandPaletteItem[]> = {};

    for (const item of items) {
      if (item.visible === false) {
        continue;
      }

      groups[item.group] ??= [];
      groups[item.group]!.push(item);
    }

    return groups;
  }, [items]);

  const runCommand = useCallback((command: CommandPaletteItem) => {
    if (!command.disabled && command.action) {
      command.action();
    }
  }, []);

  return (
    <CommandDialog open={isOpen} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search for actions..." />
      <CommandList className="pb-1">
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedItems).map(([groupName, groupItems]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {groupItems.map((item) => {
              const commandItemContent = (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  disabled={item.disabled}
                  className="h-8"
                  onSelect={() => {
                    if (item.link) {
                      // Close dialog and let Link component handle navigation
                      onOpenChange(false);
                    } else {
                      runCommand(item);
                      onOpenChange(false);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.shortcut ? <KeyShortcut className="ml-auto">{item.shortcut}</KeyShortcut> : null}
                </CommandItem>
              );

              if (item.link) {
                return (
                  <Link key={item.id} tabIndex={-1} to={item.link}>
                    {commandItemContent}
                  </Link>
                );
              }

              return commandItemContent;
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

const commandKeyCombination = {
  key: 'k',
  metaKey: true,
} as const satisfies KeyCombination;

type CommandPaletteTriggerProperties = {
  readonly items: CommandPaletteItem[];
};

function CommandPaletteTrigger({ items }: CommandPaletteTriggerProperties): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const { formattedKeyCombination } = useKeydown(commandKeyCombination, () => {
    setOpen((previous) => !previous);
  });

  return (
    <>
      <Button
        variant="outline"
        className="relative h-8 w-full max-w-sm justify-start rounded-md bg-sidebar text-sm font-normal text-muted-foreground shadow-none max-md:hidden sm:pr-12 md:w-40 dark:bg-sidebar"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Terminal />
        <span className="inline-flex">Search...</span>
        <KeyShortcut className="absolute top-1/2 right-2 -translate-y-1/2">{formattedKeyCombination}</KeyShortcut>
      </Button>
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
      <div className="flex items-center gap-2">
        {item.icon}
        {item.label}
      </div>
    ),
    [],
  );

  const getItemValue = useCallback((item: CommandPaletteItem) => item.id, []);
  const isItemDisabled = useCallback((item: CommandPaletteItem) => Boolean(item.disabled), []);

  return (
    <Tooltip>
      <ComboBoxResponsive<CommandPaletteItem>
        groupedItems={groupedItems}
        renderLabel={renderItemLabel}
        getValue={getItemValue}
        defaultValue={undefined}
        isDisabled={isItemDisabled}
        searchPlaceHolder="Search commands..."
        placeholder="Actions"
        title="Search commands..."
        description="Search for actions on the current page or across the entire platform."
        onSelect={(itemId) => {
          const selectedItem = items.find((item) => item.id === itemId);
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
          <Button variant="overlay" size="icon" className="text-muted-foreground md:hidden">
            <Menu className="size-4" />
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>More actions</TooltipContent>
    </Tooltip>
  );
}

function CommandPaletteProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
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
      {children}
      {/* Render UI with aggregated items */}
      {allItems.length > 0 ? (
        <div className="flex items-center gap-2">
          <CommandPaletteTrigger items={allItems} />
          <CommandPaletteMobile items={allItems} />
        </div>
      ) : null}
    </CommandPaletteContext.Provider>
  );
}

/**
 * Renders command palette item providers and UI
 */
function CommandsContent(): React.JSX.Element {
  const commandPaletteMatches = useTypedMatches((handles) => handles.commandPalette);

  return (
    <>
      {/* Render all command palette item providers (invisible components that register items) */}
      {commandPaletteMatches.map((match) => (
        <Fragment key={match.id}>{match.handle.commandPalette?.(match)}</Fragment>
      ))}
    </>
  );
}

/**
 * Commands component - aggregates and renders command palette items from all routes
 */
export function Commands(): React.JSX.Element {
  return (
    <CommandPaletteProvider>
      <CommandsContent />
    </CommandPaletteProvider>
  );
}
