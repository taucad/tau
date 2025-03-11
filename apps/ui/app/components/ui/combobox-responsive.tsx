import * as React from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/ui';

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
  className,
  popoverContentClassName,
  placeholder = 'Set item',
  searchPlaceHolder = 'Filter items...',
  labelAsChild = false,
  labelClassName,
}: {
  groupedItems: GroupedItems<T>[];
  renderLabel: (item: T) => React.ReactNode;
  renderButtonContents: (item: T) => React.ReactNode;
  getValue: (item: T) => string;
  defaultValue?: T;
  onSelect?: (value: string) => void;
  className?: string;
  popoverContentClassName?: string;
  placeholder?: string;
  searchPlaceHolder?: string;
  labelAsChild?: boolean;
  labelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const [selectedItem, setSelectedItem] = React.useState<T | undefined>(defaultValue);

  const handleSelect = (item: T) => {
    setSelectedItem(item);
    setOpen(false);
    onSelect?.(getValue(item));
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button variant="ghost" className={cn('w-[150px] justify-start', className)}>
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
              renderLabel={renderLabel}
              getValue={getValue}
              searchPlaceHolder={searchPlaceHolder}
              labelAsChild={labelAsChild}
              labelClassName={labelClassName}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={cn('w-[150px] justify-start', className)}>
          {selectedItem ? renderButtonContents(selectedItem) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[200px] p-0', popoverContentClassName)} align="start">
        <ItemList
          groupedItems={groupedItems}
          setSelectedItem={handleSelect}
          renderLabel={renderLabel}
          getValue={getValue}
          searchPlaceHolder={searchPlaceHolder}
          labelAsChild={labelAsChild}
          labelClassName={labelClassName}
        />
      </PopoverContent>
    </Popover>
  );
}

function ItemList<T>({
  groupedItems,
  setSelectedItem,
  renderLabel,
  getValue,
  searchPlaceHolder,
  labelAsChild,
  labelClassName,
}: {
  groupedItems: GroupedItems<T>[];
  setSelectedItem: (item: T) => void;
  renderLabel: (item: T) => React.ReactNode;
  getValue: (item: T) => string;
  searchPlaceHolder: string;
  labelAsChild?: boolean;
  labelClassName?: string;
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
                  asChild={labelAsChild}
                  key={value}
                  value={value}
                  keywords={[group.name]}
                  onSelect={() => {
                    setSelectedItem(item);
                  }}
                  className={cn('cursor-pointer', labelClassName)}
                >
                  {renderLabel(item)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
