import type { ReactNode } from 'react';
import React from 'react';
import type { ClassValue } from 'clsx';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#components/ui/command.js';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '#components/ui/drawer.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { cn } from '#utils/ui.utils.js';

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
          aria-describedby="drawer-title"
          {...properties}
          {...drawerProperties}
          className={cn(className, drawerProperties?.className)}
        >
          <DrawerTitle className="sr-only" id="drawer-title">
            {placeholder}
          </DrawerTitle>
          <div className="mt-4 border-t">
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
            />
          </div>
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
}) {
  return (
    <Command>
      <CommandInput placeholder={searchPlaceHolder} />
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
