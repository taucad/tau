import type { ReactNode } from 'react';
import React from 'react';
import type { ClassValue } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#components/command.js';
import {
  Drawer,
  DrawerAction,
  DrawerBar,
  DrawerNestedRoot,
  DrawerContent,
  DrawerDescription,
  DrawerDivider,
  DrawerList,
  DrawerTitle,
  DrawerTrigger,
  drawerBarTitleClass,
  useIsInsideDrawer,
} from '#components/drawer.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover.js';
import { cn } from '#utils/cn.js';
import { menuGroupHeadingClass, menuViewTriggerChevronClass } from '#components/menu.variants.js';
import {
  stepBackOnEmptySearch,
  useViewStack,
  ViewStackBackContent,
  viewStackEnterClass,
} from '#components/view-stack.js';
import type { ViewStack } from '#components/view-stack.js';
import { Loader } from '#components/loader.js';

type GroupedItems<T> = {
  name: string;
  items: T[];
};

/**
 * A row that opens more items in place of the list, under a Back row (UX policy §7). Search stays global: a non-empty
 * search lists the items of every level.
 *
 * @public
 */
export type ComboBoxSubView<T> = {
  readonly id: string;
  /** The row's content in the parent list. */
  readonly label: ReactNode;
  /** The sub-view's name, on its Back row and as the row's accessible text. */
  readonly title: string;
  readonly groupedItems: ReadonlyArray<GroupedItems<T>>;
};

type ComboBoxResponsiveProperties<T> = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onSelect' | 'value'
> & {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly children: ReactNode;
  readonly getValue: (item: T) => string;
  /** Additional human-readable search terms that are distinct from the stable item value. */
  readonly getKeywords?: (item: T) => readonly string[];
  /** Controlled selection (`selectedItem` in `renderLabel` + checkmark alignment). Mirrors parent source of truth — no internal snapshot stalemate. */
  readonly value?: T | undefined;
  readonly onSelect?: (value: string) => void;
  readonly onClose?: () => void;
  /** Controlled open state. When provided, parent owns open/close. */
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /**
   * The className for the popover/drawer content.
   */
  readonly className?: string;
  readonly popoverProperties?: React.ComponentProps<typeof PopoverContent>;
  readonly drawerProperties?: React.ComponentProps<typeof DrawerContent>;
  readonly placeholder?: string;
  readonly searchPlaceHolder?: string;
  readonly asChildLabel?: boolean;
  readonly labelClassName?: string;
  readonly isDisabled?: (item: T) => boolean;
  readonly emptyListMessage?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly isSearchEnabled?: boolean;
  readonly withVirtualization?: boolean;
  readonly virtualizationHeight?: number;
  readonly isLoadingMore?: boolean;
  readonly onLoadMore?: () => void;
  /**
   * Stack the mobile drawer on the drawer it opens from, with a Back control above the list.
   * Defaults to whether the combobox renders inside a drawer.
   */
  readonly isNested?: boolean;
  /**
   * Callback to determine if the combobox should close after selecting an item.
   * Receives the selected item value. Return true to close, false to keep open.
   * Defaults to always closing.
   */
  readonly shouldCloseOnSelect?: (value: string) => boolean;
  /** Rendered below the command list (outside keyboard navigation). */
  readonly footer?: ReactNode;
  /** Rows that open sub-views of more items in the same popover or drawer. Not combined with virtualization. */
  readonly subViews?: ReadonlyArray<ComboBoxSubView<T>>;
  /** Controlled search text; omit to let the list own it. */
  readonly search?: string;
  readonly onSearchChange?: (search: string) => void;
};

/**
 * A searchable single-choice list: a popover above the trigger on wide screens and a drawer on mobile.
 * Opened from inside another drawer, the drawer stacks on it and offers a Back control.
 *
 * @param props - Items, the selected value, labels and the trigger.
 * @returns The responsive combobox.
 *
 * @public
 */
export function ComboBoxResponsive<T>({
  groupedItems,
  renderLabel,
  children,
  getValue,
  getKeywords,
  value,
  onSelect,
  onClose,
  isOpen: isOpenProperty,
  onOpenChange,
  className,
  popoverProperties,
  drawerProperties,
  placeholder = 'Set item',
  searchPlaceHolder = 'Filter items…',
  asChildLabel = false,
  labelClassName,
  isDisabled,
  emptyListMessage = 'No results found.',
  title,
  description,
  isSearchEnabled = true,
  withVirtualization = false,
  virtualizationHeight = 300,
  isLoadingMore = false,
  onLoadMore,
  isNested: isNestedProperty,
  shouldCloseOnSelect,
  footer,
  subViews,
  search,
  onSearchChange,
  ...properties
}: ComboBoxResponsiveProperties<T>): React.JSX.Element {
  const stack = useViewStack<string>('root');
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = isOpenProperty !== undefined;
  const open = isControlled ? isOpenProperty : uncontrolledOpen;
  const isMobile = useIsMobile();
  const isInsideDrawer = useIsInsideDrawer();
  const isNested = isNestedProperty ?? isInsideDrawer;
  const selectionMadeReference = React.useRef(false);
  const pointerDismissedReference = React.useRef(false);
  const closeFocusReference = React.useRef(false);
  /* `onClose` runs where the surface hands focus back: called on the close
     itself, the popover or drawer would move focus to its trigger right after. */
  const handleCloseAutoFocus = (event: Event): void => {
    if (closeFocusReference.current) {
      closeFocusReference.current = false;
      event.preventDefault();
      onClose?.();
    }
  };

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }

      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const handleSelect = (item: T) => {
    const resolved = getValue(item);
    const shouldClose = shouldCloseOnSelect?.(resolved) ?? true;

    if (shouldClose) {
      selectionMadeReference.current = true;
      setOpen(false);
    }

    onSelect?.(resolved);
  };

  const { reset } = stack;
  React.useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  /** Escape steps back one sub-view before it closes the list. */
  const stepBackOnEscape = (event: KeyboardEvent): void => {
    if (stack.pop()) {
      event.preventDefault();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    // Pointer dismissal owns the next focus target. Refocusing the composer here
    // races a sibling picker opening from the same click and closes it again.
    if (!isOpen && !selectionMadeReference.current && !pointerDismissedReference.current && open) {
      closeFocusReference.current = onClose !== undefined;
    }

    // Reset the selection flag when opening
    if (isOpen) {
      selectionMadeReference.current = false;
      pointerDismissedReference.current = false;
    }

    setOpen(isOpen);
  };

  if (isMobile) {
    const DrawerRoot = isNested ? DrawerNestedRoot : Drawer;

    return (
      <DrawerRoot open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent
          aria-labelledby='drawer-title'
          aria-describedby='drawer-description'
          {...properties}
          {...drawerProperties}
          /* A caller's width is for the popover; the drawer spans the screen. */
          className={cn('[&_[data-slot=command]]:bg-transparent', className, 'w-auto', drawerProperties?.className)}
          onCloseAutoFocus={(event) => {
            drawerProperties?.onCloseAutoFocus?.(event);
            handleCloseAutoFocus(event);
          }}
          onEscapeKeyDown={(event) => {
            stepBackOnEscape(event);
            if (!event.defaultPrevented) {
              drawerProperties?.onEscapeKeyDown?.(event);
            }
          }}
        >
          {isNested ? (
            <>
              <DrawerBar
                data-slot='combobox-drawer-header'
                className='grid grid-cols-[calc(var(--spacing)*11)_minmax(0,1fr)_calc(var(--spacing)*11)]'
              >
                {/* The matching empty column keeps the title on the drawer's centre line. */}
                <DrawerAction
                  type='button'
                  aria-label='Back'
                  onClick={() => {
                    handleOpenChange(false);
                  }}
                >
                  {/* Optically centred: the open side's two stroke ends outweigh the point, so a box-centred
                      chevron reads as sitting right; a half-pixel nudge left and a lighter stroke settle it. */}
                  <ChevronLeft className='size-6 -translate-x-[0.5px]' strokeWidth={1.25} />
                </DrawerAction>
                <DrawerTitle className={cn(drawerBarTitleClass, 'text-center')} id='drawer-title'>
                  {title}
                </DrawerTitle>
                <span aria-hidden />
              </DrawerBar>
              <DrawerDivider />
            </>
          ) : (
            <DrawerTitle className='sr-only' id='drawer-title'>
              {title}
            </DrawerTitle>
          )}
          <DrawerDescription className='sr-only' id='drawer-description'>
            {description}
          </DrawerDescription>
          <DrawerList className='drawer-command-rows contents drawer-inset-hairlines'>
            <ItemList
              groupedItems={groupedItems}
              onPick={handleSelect}
              selectedItem={value}
              renderLabel={renderLabel}
              getValue={getValue}
              getKeywords={getKeywords}
              searchPlaceHolder={searchPlaceHolder}
              asChildLabel={asChildLabel}
              labelClassName={labelClassName}
              isDisabled={isDisabled}
              emptyListMessage={emptyListMessage}
              isSearchEnabled={isSearchEnabled}
              withVirtualization={withVirtualization}
              // A phone's list fills the drawer, not the popover's fixed height.
              virtualizationHeight='60dvh'
              isLoadingMore={isLoadingMore}
              onLoadMore={onLoadMore}
              subViews={subViews}
              stack={stack}
              search={search}
              parentTitle={title}
              onSearchChange={onSearchChange}
            />
            {footer}
          </DrawerList>
        </DrawerContent>
      </DrawerRoot>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        {...properties}
        {...popoverProperties}
        className={cn('w-50 overflow-hidden p-0', className, popoverProperties?.className)}
        onPointerDownOutside={(event) => {
          popoverProperties?.onPointerDownOutside?.(event);
          pointerDismissedReference.current = !event.defaultPrevented;
        }}
        onCloseAutoFocus={(event) => {
          popoverProperties?.onCloseAutoFocus?.(event);
          handleCloseAutoFocus(event);
        }}
        onEscapeKeyDown={(event) => {
          stepBackOnEscape(event);
          if (!event.defaultPrevented) {
            popoverProperties?.onEscapeKeyDown?.(event);
          }
        }}
      >
        <>
          <ItemList
            groupedItems={groupedItems}
            onPick={handleSelect}
            selectedItem={value}
            renderLabel={renderLabel}
            getValue={getValue}
            getKeywords={getKeywords}
            searchPlaceHolder={searchPlaceHolder}
            asChildLabel={asChildLabel}
            labelClassName={labelClassName}
            isDisabled={isDisabled}
            emptyListMessage={emptyListMessage}
            isSearchEnabled={isSearchEnabled}
            withVirtualization={withVirtualization}
            virtualizationHeight={virtualizationHeight}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            subViews={subViews}
            stack={stack}
            search={search}
            parentTitle={title}
            onSearchChange={onSearchChange}
          />
          {footer}
        </>
      </PopoverContent>
    </Popover>
  );
}

function ItemList<T>({
  groupedItems,
  onPick,
  selectedItem,
  renderLabel,
  getValue,
  getKeywords,
  searchPlaceHolder,
  asChildLabel: labelAsChild,
  labelClassName,
  isDisabled,
  emptyListMessage,
  isSearchEnabled = true,
  withVirtualization = false,
  virtualizationHeight = 300,
  isLoadingMore = false,
  onLoadMore,
  subViews,
  stack,
  search: searchProperty,
  onSearchChange,
  parentTitle,
}: {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly onPick: (item: T) => void;
  readonly selectedItem: T | undefined;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly getValue: (item: T) => string;
  readonly getKeywords?: (item: T) => readonly string[];
  readonly searchPlaceHolder: string;
  readonly asChildLabel?: boolean;
  readonly labelClassName?: ClassValue;
  readonly isDisabled?: (item: T) => boolean;
  readonly emptyListMessage?: ReactNode;
  readonly isSearchEnabled?: boolean;
  readonly withVirtualization?: boolean;
  /** Pixels, or a CSS length such as `60dvh`. */
  readonly virtualizationHeight?: number | string;
  readonly isLoadingMore?: boolean;
  readonly onLoadMore?: () => void;
  readonly subViews?: ReadonlyArray<ComboBoxSubView<T>>;
  readonly stack: ViewStack<string>;
  readonly search?: string;
  readonly onSearchChange?: (search: string) => void;
  /** The list's name, for the Back row's accessible name. */
  readonly parentTitle: string;
}) {
  const [ownSearch, setOwnSearch] = React.useState('');
  const search = searchProperty ?? ownSearch;
  const setSearch = (next: string): void => {
    if (searchProperty === undefined) {
      setOwnSearch(next);
    }
    onSearchChange?.(next);
  };
  const lastSearchLoad = React.useRef('');
  const nonEmptyGroups = React.useMemo(() => groupedItems.filter((group) => group.items.length > 0), [groupedItems]);

  type FlatItem =
    | { type: 'item'; item: T; groupName: string; value: string; keywords: readonly string[] }
    | { type: 'header'; groupName: string };

  // Flatten all items from all groups for virtualization, including group headers
  const flattenedItems = React.useMemo((): FlatItem[] => {
    return nonEmptyGroups.flatMap((group) => [
      { type: 'header', groupName: group.name } as const,
      ...group.items.map(
        (item) =>
          ({
            type: 'item',
            item,
            groupName: group.name,
            value: getValue(item),
            keywords: getKeywords?.(item) ?? [],
          }) as const,
      ),
    ]);
  }, [nonEmptyGroups, getKeywords, getValue]);

  // Filter items based on search
  const filteredItems = React.useMemo((): FlatItem[] => {
    if (!search || !withVirtualization) {
      return flattenedItems;
    }

    const searchLower = search.toLowerCase();

    // Filter items and track which groups still have items
    const filteredItemEntries = flattenedItems.filter(
      (entry) =>
        entry.type === 'item' &&
        (entry.value.toLowerCase().includes(searchLower) ||
          entry.groupName.toLowerCase().includes(searchLower) ||
          entry.keywords.some((keyword) => keyword.toLowerCase().includes(searchLower))),
    );

    // Get unique group names that have matching items
    const groupsWithItems = new Set(filteredItemEntries.map((entry) => (entry as { groupName: string }).groupName));

    // Include headers only for groups that have matching items
    return flattenedItems.filter(
      (entry) =>
        (entry.type === 'header' && groupsWithItems.has(entry.groupName)) ||
        (entry.type === 'item' &&
          (entry.value.toLowerCase().includes(searchLower) ||
            entry.groupName.toLowerCase().includes(searchLower) ||
            entry.keywords.some((keyword) => keyword.toLowerCase().includes(searchLower)))),
    );
  }, [flattenedItems, search, withVirtualization]);

  React.useEffect(() => {
    const key = `${search}\0${String(flattenedItems.length)}`;
    if (
      withVirtualization &&
      search !== '' &&
      filteredItems.length === 0 &&
      onLoadMore !== undefined &&
      !isLoadingMore &&
      lastSearchLoad.current !== key
    ) {
      lastSearchLoad.current = key;
      const searchLoadTimeout = globalThis.setTimeout(onLoadMore, 150);
      return () => {
        globalThis.clearTimeout(searchLoadTimeout);
      };
    }
    return undefined;
  }, [filteredItems.length, flattenedItems.length, isLoadingMore, onLoadMore, search, withVirtualization]);

  // Render individual item or group header
  const renderItem = React.useCallback(
    (index: number) => {
      const itemData = filteredItems[index];
      if (!itemData) {
        return undefined;
      }

      // Render group header
      if (itemData.type === 'header') {
        return (
          <div
            key={`header-${itemData.groupName}`}
            data-slot='combobox-group-heading'
            className={menuGroupHeadingClass}
          >
            {itemData.groupName}
          </div>
        );
      }

      const { item, value, keywords } = itemData;

      return (
        <CommandItem
          key={value}
          asChild={labelAsChild}
          value={value}
          keywords={[itemData.groupName, ...keywords]}
          className={cn(labelClassName)}
          disabled={isDisabled?.(item)}
          onSelect={() => {
            onPick(item);
          }}
        >
          {renderLabel(item, selectedItem)}
        </CommandItem>
      );
    },
    [filteredItems, labelAsChild, labelClassName, isDisabled, renderLabel, selectedItem, onPick],
  );

  if (withVirtualization) {
    return (
      <Command shouldFilter={false}>
        {isSearchEnabled ? (
          <CommandInput placeholder={searchPlaceHolder} value={search} onValueChange={setSearch} />
        ) : null}
        <CommandList>
          {filteredItems.length === 0 ? (
            <CommandEmpty className='mx-2'>{emptyListMessage}</CommandEmpty>
          ) : (
            <Virtuoso
              style={{
                height: typeof virtualizationHeight === 'number' ? `${virtualizationHeight}px` : virtualizationHeight,
              }}
              totalCount={filteredItems.length}
              itemContent={renderItem}
              endReached={onLoadMore}
              // Virtuoso's List component doesn't handle vertical padding correctly due to
              // absolute positioning used for virtualization. Use Header/Footer for vertical
              // spacing instead.
              components={{
                List: (properties) => (
                  <div {...properties} data-slot='combobox-virtual-list' className='flex flex-col gap-0.5 px-1' />
                ),
                Header: () => <div className='h-1' />,
                Footer: isLoadingMore
                  ? () => (
                      <div className='flex items-center gap-2 p-2 text-sm text-muted-foreground'>
                        <Loader />
                        <span>Loading more…</span>
                      </div>
                    )
                  : () => <div className='h-1' />,
              }}
            />
          )}
        </CommandList>
      </Command>
    );
  }

  return (
    <NestedItemList
      groupedItems={groupedItems}
      subViews={subViews ?? []}
      stack={stack}
      search={search}
      setSearch={setSearch}
      isSearchEnabled={isSearchEnabled}
      searchPlaceHolder={searchPlaceHolder}
      emptyListMessage={emptyListMessage}
      parentTitle={parentTitle}
      renderItem={(group, item) => {
        const value = getValue(item);
        return (
          <CommandItem
            key={value}
            asChild={labelAsChild}
            value={value}
            keywords={[group, ...(getKeywords?.(item) ?? [])]}
            className={cn(labelClassName)}
            disabled={isDisabled?.(item)}
            onSelect={() => {
              onPick(item);
            }}
          >
            {renderLabel(item, selectedItem)}
          </CommandItem>
        );
      }}
      getValue={getValue}
    />
  );
}

/** The cmdk values of the rows the list adds; item values are the caller's. */
const viewValue = (id: string): string => `combobox-sub-view:${id}`;
const backValue = 'combobox-view-back';

/** Merge groups of the same name, keeping first-seen order and dropping repeated items. */
function mergeGroups<T>(groups: ReadonlyArray<GroupedItems<T>>, getValue: (item: T) => string): Array<GroupedItems<T>> {
  const seen = new Set<string>();
  const merged = new Map<string, T[]>();
  for (const group of groups) {
    const items = merged.get(group.name) ?? [];
    merged.set(group.name, items);
    for (const item of group.items) {
      const value = getValue(item);
      if (!seen.has(value)) {
        seen.add(value);
        items.push(item);
      }
    }
  }
  return [...merged].map(([name, items]) => ({ name, items })).filter((group) => group.items.length > 0);
}

/**
 * The list with its sub-views: the root's groups and a row per sub-view; a sub-view's Back row and groups; or, while
 * searching, the items of every level. Backspace in an empty search steps back, as Escape does.
 */
function NestedItemList<T>({
  groupedItems,
  subViews,
  stack,
  search,
  setSearch,
  isSearchEnabled,
  searchPlaceHolder,
  emptyListMessage,
  renderItem,
  getValue,
  parentTitle,
}: {
  readonly parentTitle: string;
  readonly groupedItems: ReadonlyArray<GroupedItems<T>>;
  readonly subViews: ReadonlyArray<ComboBoxSubView<T>>;
  readonly stack: ViewStack<string>;
  readonly search: string;
  readonly setSearch: (search: string) => void;
  readonly isSearchEnabled: boolean;
  readonly searchPlaceHolder: string;
  readonly emptyListMessage: ReactNode;
  readonly renderItem: (group: string, item: T) => React.JSX.Element;
  readonly getValue: (item: T) => string;
}): React.JSX.Element {
  const view = subViews.find(({ id }) => id === stack.view);
  const isSearching = search !== '' && subViews.length > 0;
  /* The cmdk list highlights rows itself: a step back highlights the row that opened the view, an open the view's first item. */
  const [highlighted, setHighlighted] = React.useState<string | undefined>(undefined);
  const { returnedTo, depth } = stack;
  React.useEffect(() => {
    if (returnedTo !== undefined) {
      setHighlighted(returnedTo);
    }
  }, [returnedTo, depth]);
  const groups = isSearching
    ? mergeGroups([...groupedItems, ...subViews.flatMap((subView) => subView.groupedItems)], getValue)
    : (view?.groupedItems ?? groupedItems).filter((group) => group.items.length > 0);
  const open = (subView: ComboBoxSubView<T>): void => {
    stack.push(subView.id, { returnKey: viewValue(subView.id) });
    const first = subView.groupedItems.find((group) => group.items.length > 0)?.items[0];
    setHighlighted(first === undefined ? backValue : getValue(first));
  };
  return (
    <Command
      {...(highlighted === undefined ? {} : { value: highlighted })}
      onValueChange={setHighlighted}
      onKeyDown={stepBackOnEmptySearch(search, stack.pop)}
    >
      {isSearchEnabled ? (
        <CommandInput placeholder={searchPlaceHolder} value={search} onValueChange={setSearch} />
      ) : null}
      <CommandList key={stack.view} className={viewStackEnterClass(stack.direction)}>
        <CommandEmpty className='mx-2'>{emptyListMessage}</CommandEmpty>
        {view ? (
          <CommandGroup forceMount>
            <CommandItem
              forceMount
              value={backValue}
              data-slot='combobox-view-back'
              aria-label={`Back to ${parentTitle}`}
              className='text-muted-foreground'
              onSelect={() => {
                stack.pop();
              }}
            >
              <ViewStackBackContent title={view.title} />
            </CommandItem>
          </CommandGroup>
        ) : null}
        {groups.map((group) => (
          <CommandGroup key={group.name} heading={group.name}>
            {group.items.map((item) => renderItem(group.name, item))}
          </CommandGroup>
        ))}
        {view !== undefined || isSearching || subViews.length === 0 ? null : (
          <CommandGroup data-slot='combobox-sub-views'>
            {subViews.map((subView) => (
              <CommandItem
                key={subView.id}
                value={viewValue(subView.id)}
                keywords={[subView.title]}
                data-slot='combobox-sub-view-trigger'
                aria-haspopup='true'
                onSelect={() => {
                  open(subView);
                }}
              >
                {subView.label}
                <ChevronRight aria-hidden className={menuViewTriggerChevronClass} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
