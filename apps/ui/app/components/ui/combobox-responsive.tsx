import type { ReactNode } from 'react';
import React from 'react';
import type { ClassValue } from 'clsx';
import { Virtuoso } from 'react-virtuoso';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#components/ui/command.js';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '#components/ui/drawer.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { cn } from '#utils/ui.utils.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';

type GroupedItems<T> = {
  name: string;
  items: T[];
};

type ComboBoxResponsiveProperties<T> = Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onSelect'> & {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly children: ReactNode;
  readonly getValue: (item: T) => string;
  readonly defaultValue: T | undefined;
  readonly onSelect?: (value: string) => void;
  readonly onClose?: () => void;
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
};

export function ComboBoxResponsive<T>({
  groupedItems,
  renderLabel,
  children,
  getValue,
  defaultValue,
  onSelect,
  onClose,
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
  ...properties
}: ComboBoxResponsiveProperties<T>): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const [selectedItem, setSelectedItem] = React.useState<T | undefined>(defaultValue);
  const selectionMadeReference = React.useRef(false);

  const handleSelect = (item: T) => {
    setSelectedItem(item);
    selectionMadeReference.current = true;
    setOpen(false);
    onSelect?.(getValue(item));
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
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent
          aria-labelledby="drawer-title"
          aria-describedby="drawer-description"
          {...properties}
          {...drawerProperties}
          className={cn(className, drawerProperties?.className)}
        >
          <DrawerTitle className="sr-only" id="drawer-title">
            {title}
          </DrawerTitle>
          <DrawerDescription className="sr-only" id="drawer-description">
            {description}
          </DrawerDescription>
          <ItemList
            groupedItems={groupedItems}
            setSelectedItem={handleSelect}
            selectedItem={selectedItem}
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
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        {...properties}
        {...popoverProperties}
        className={cn('w-[200px] p-0', className, popoverProperties?.className)}
      >
        <ItemList
          groupedItems={groupedItems}
          setSelectedItem={handleSelect}
          selectedItem={selectedItem}
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
      </PopoverContent>
    </Popover>
  );
}

function ItemList<T>({
  groupedItems,
  setSelectedItem,
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
  readonly setSelectedItem: (item: T) => void;
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

  // Flatten all items from all groups for virtualization
  const flattenedItems = React.useMemo(() => {
    return groupedItems.flatMap((group) =>
      group.items.map((item) => ({
        item,
        groupName: group.name,
        value: getValue(item),
      })),
    );
  }, [groupedItems, getValue]);

  // Filter items based on search
  const filteredItems = React.useMemo(() => {
    if (!search || !withVirtualization) {
      return flattenedItems;
    }

    const searchLower = search.toLowerCase();
    return flattenedItems.filter(
      ({ value, groupName }) =>
        value.toLowerCase().includes(searchLower) || groupName.toLowerCase().includes(searchLower),
    );
  }, [flattenedItems, search, withVirtualization]);

  // Render individual item
  const renderItem = React.useCallback(
    (index: number) => {
      const itemData = filteredItems[index];
      if (!itemData) {
        return undefined;
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
            setSelectedItem(item);
          }}
        >
          {renderLabel(item, selectedItem)}
        </CommandItem>
      );
    },
    [filteredItems, labelAsChild, labelClassName, isDisabled, renderLabel, selectedItem, setSelectedItem],
  );

  if (withVirtualization) {
    return (
      <Command shouldFilter={false}>
        {isSearchEnabled ? (
          <CommandInput placeholder={searchPlaceHolder} value={search} onValueChange={setSearch} />
        ) : null}
        <CommandList className="p-1">
          {filteredItems.length === 0 ? (
            <CommandEmpty>{emptyListMessage}</CommandEmpty>
          ) : (
            <Virtuoso
              style={{ height: `${virtualizationHeight}px` }}
              totalCount={filteredItems.length}
              itemContent={renderItem}
              className="overflow-y-auto"
              endReached={onLoadMore}
              components={{
                Footer: isLoadingMore
                  ? () => (
                      <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                        <LoadingSpinner />
                        <span>Loading more...</span>
                      </div>
                    )
                  : undefined,
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
                    setSelectedItem(item);
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
