import type { JSX, ReactNode } from 'react';
import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile.js';
import { Button } from '@/components/ui/button.js';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.js';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { cn } from '@/utils/ui.js';

type GroupedItems<T> = {
  name: string;
  items: T[];
};

export function ComboBoxResponsive<T>({
  groupedItems,
  renderLabel,
  renderButtonContents,
  getValue,
  defaultValue,
  onSelect,
  onClose,
  className,
  popoverContentClassName,
  placeholder = 'Set item',
  searchPlaceHolder = 'Filter items...',
  asChildLabel = false,
  labelClassName,
}: {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly renderButtonContents: (item: T) => ReactNode;
  readonly getValue: (item: T) => string;
  readonly defaultValue?: T;
  readonly onSelect?: (value: string) => void;
  readonly onClose?: () => void;
  readonly className?: string;
  readonly popoverContentClassName?: string;
  readonly placeholder?: string;
  readonly searchPlaceHolder?: string;
  readonly asChildLabel?: boolean;
  readonly labelClassName?: string;
}): JSX.Element {
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
        <DrawerTrigger asChild>
          <Button variant="ghost" className={className}>
            {selectedItem ? renderButtonContents(selectedItem) : placeholder}
          </Button>
        </DrawerTrigger>
        <DrawerContent aria-describedby="drawer-title">
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
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={cn('w-[150px] justify-start', className)}>
          {selectedItem ? renderButtonContents(selectedItem) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[200px] p-0', popoverContentClassName)} align="start">
        <ItemList
          groupedItems={groupedItems}
          setSelectedItem={handleSelect}
          selectedItem={selectedItem}
          renderLabel={renderLabel}
          getValue={getValue}
          searchPlaceHolder={searchPlaceHolder}
          asChildLabel={asChildLabel}
          labelClassName={labelClassName}
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
}: {
  readonly groupedItems: Array<GroupedItems<T>>;
  readonly setSelectedItem: (item: T) => void;
  readonly selectedItem: T | undefined;
  readonly renderLabel: (item: T, selectedItem: T | undefined) => ReactNode;
  readonly getValue: (item: T) => string;
  readonly searchPlaceHolder: string;
  readonly asChildLabel?: boolean;
  readonly labelClassName?: string;
}) {
  return (
    <Command>
      <CommandInput placeholder={searchPlaceHolder} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
                  className={cn('cursor-pointer', labelClassName)}
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
