import type { ReactNode } from 'react';
import React from 'react';
import type { ClassValue } from 'clsx';
import { Virtuoso } from 'react-virtuoso';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#components/ui/command.js';
import {
  Drawer,
  DrawerNestedRoot,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '#components/ui/drawer.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { cn } from '#utils/ui.utils.js';
import { Loader } from '#components/ui/loader.js';

type GroupedItems<T> = {
  name: string;
  items: T[];
};

type ComboBoxResponsiveProperties<T> = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onSelect' | 'value'
> & {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly children: ReactNode;
  readonly getValue: (item: T) => string;
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
   * Use DrawerNestedRoot instead of Drawer when inside another drawer.
   * This enables proper nested drawer behavior with Vaul.
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
};

export function ComboBoxResponsive<T>({
  groupedItems,
  renderLabel,
  children,
  getValue,
  value,
  onSelect,
  onClose,
  isOpen: isOpenProperty,
  onOpenChange,
  className,
  popoverProperties,
  drawerProperties,
  placeholder = 'Set item',
  searchPlaceHolder = 'Filter items...',
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
  isNested = false,
  shouldCloseOnSelect,
  footer,
  ...properties
}: ComboBoxResponsiveProperties<T>): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = isOpenProperty !== undefined;
  const open = isControlled ? isOpenProperty : uncontrolledOpen;
  const isMobile = useIsMobile();
  const selectionMadeReference = React.useRef(false);

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

  const handleOpenChange = (isOpen: boolean) => {
    // If closing without making a selection, trigger onClose
    if (!isOpen && !selectionMadeReference.current && open) {
      onClose?.();
    }

    // Reset the selection flag when opening
    if (isOpen) {
      selectionMadeReference.current = false;
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
          className={cn('[&_[data-slot=command]]:bg-transparent', className, drawerProperties?.className)}
        >
          <DrawerTitle className='sr-only' id='drawer-title'>
            {title}
          </DrawerTitle>
          <DrawerDescription className='sr-only' id='drawer-description'>
            {description}
          </DrawerDescription>
          <>
            <ItemList
              groupedItems={groupedItems}
              onPick={handleSelect}
              selectedItem={value}
              renderLabel={renderLabel}
              getValue={getValue}
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
            />
            {footer}
          </>
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
        className={cn('w-[200px] overflow-hidden p-0', className, popoverProperties?.className)}
      >
        <>
          <ItemList
            groupedItems={groupedItems}
            onPick={handleSelect}
            selectedItem={value}
            renderLabel={renderLabel}
            getValue={getValue}
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
}: {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly onPick: (item: T) => void;
  readonly selectedItem: T | undefined;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly getValue: (item: T) => string;
  readonly searchPlaceHolder: string;
  readonly asChildLabel?: boolean;
  readonly labelClassName?: ClassValue;
  readonly isDisabled?: (item: T) => boolean;
  readonly emptyListMessage?: ReactNode;
  readonly isSearchEnabled?: boolean;
  readonly withVirtualization?: boolean;
  readonly virtualizationHeight?: number;
  readonly isLoadingMore?: boolean;
  readonly onLoadMore?: () => void;
}) {
  const [search, setSearch] = React.useState('');

  type FlatItem = { type: 'item'; item: T; groupName: string; value: string } | { type: 'header'; groupName: string };

  // Flatten all items from all groups for virtualization, including group headers
  const flattenedItems = React.useMemo((): FlatItem[] => {
    return groupedItems.flatMap((group) => [
      { type: 'header', groupName: group.name } as const,
      ...group.items.map(
        (item) =>
          ({
            type: 'item',
            item,
            groupName: group.name,
            value: getValue(item),
          }) as const,
      ),
    ]);
  }, [groupedItems, getValue]);

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
        (entry.value.toLowerCase().includes(searchLower) || entry.groupName.toLowerCase().includes(searchLower)),
    );

    // Get unique group names that have matching items
    const groupsWithItems = new Set(filteredItemEntries.map((entry) => (entry as { groupName: string }).groupName));

    // Include headers only for groups that have matching items
    return flattenedItems.filter(
      (entry) =>
        (entry.type === 'header' && groupsWithItems.has(entry.groupName)) ||
        (entry.type === 'item' &&
          (entry.value.toLowerCase().includes(searchLower) || entry.groupName.toLowerCase().includes(searchLower))),
    );
  }, [flattenedItems, search, withVirtualization]);

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
          <div key={`header-${itemData.groupName}`} className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>
            {itemData.groupName}
          </div>
        );
      }

      const { item, value } = itemData;

      return (
        <CommandItem
          key={value}
          asChild={labelAsChild}
          value={value}
          keywords={[itemData.groupName]}
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
            <CommandEmpty>{emptyListMessage}</CommandEmpty>
          ) : (
            <Virtuoso
              style={{ height: `${virtualizationHeight}px` }}
              totalCount={filteredItems.length}
              itemContent={renderItem}
              endReached={onLoadMore}
              // Virtuoso's List component doesn't handle vertical padding correctly due to
              // absolute positioning used for virtualization. Use Header/Footer for vertical
              // spacing instead.
              components={{
                List: (properties) => <div {...properties} className='px-1' />,
                Header: () => <div className='h-1' />,
                Footer: isLoadingMore
                  ? () => (
                      <div className='flex items-center gap-2 p-2 text-sm text-muted-foreground'>
                        <Loader />
                        <span>Loading more...</span>
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
    <Command>
      {isSearchEnabled ? <CommandInput placeholder={searchPlaceHolder} /> : null}
      <CommandList>
        <CommandEmpty>{emptyListMessage}</CommandEmpty>
        {groupedItems.map((group) => (
          <CommandGroup key={group.name} heading={group.name}>
            {group.items.map((item) => {
              const value = getValue(item);
              return (
                <CommandItem
                  key={value}
                  asChild={labelAsChild}
                  value={value}
                  keywords={[group.name]}
                  className={cn(labelClassName)}
                  disabled={isDisabled?.(item)}
                  onSelect={() => {
                    onPick(item);
                  }}
                >
                  {renderLabel(item, selectedItem)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
