import * as React from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/ui';

type GroupedItems<T> = {
  name: string;
  items: T[];
};

export function ComboBoxResponsive<T extends { label: string; value: unknown }>({
  groupedItems,
  renderLabel,
  renderButtonContents,
  getValue,
  defaultValue,
  onSelect,
  className,
  popoverContentClassName,
  placeholder = 'Set item',
}: {
  groupedItems: GroupedItems<T>[];
  renderLabel: (item: T) => React.ReactNode;
  renderButtonContents: (value: string) => React.ReactNode;
  getValue: (item: T) => string;
  defaultValue?: string;
  onSelect?: (value: string) => void;
  className?: string;
  popoverContentClassName?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const [selectedItem, setSelectedItem] = React.useState<string | undefined>(defaultValue);

  const handleSelect = (item: T) => {
    setSelectedItem(getValue(item));
    setOpen(false);
    onSelect?.(getValue(item));
  };

  const value = selectedItem ?? placeholder;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button variant="outline" className={cn('w-[150px] justify-start', className)}>
            {renderButtonContents(value)}
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <div className="mt-4 border-t">
            <ItemList
              groupedItems={groupedItems}
              setSelectedItem={handleSelect}
              renderLabel={renderLabel}
              getValue={getValue}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-[150px] justify-start', className)}>
          {renderButtonContents(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[200px] p-0', popoverContentClassName)} align="start">
        <ItemList
          groupedItems={groupedItems}
          setSelectedItem={handleSelect}
          renderLabel={renderLabel}
          getValue={getValue}
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
}: {
  groupedItems: GroupedItems<T>[];
  setSelectedItem: (item: T) => void;
  renderLabel: (item: T) => React.ReactNode;
  getValue: (item: T) => string;
}) {
  return (
    <Command>
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groupedItems.map((group) => (
          <CommandGroup key={group.name} heading={group.name}>
            {group.items.map((item) => {
              const value = getValue(item);
              return (
                <CommandItem
                  key={value}
                  value={value}
                  keywords={[group.name]}
                  onSelect={() => {
                    setSelectedItem(item);
                  }}
                >
                  {renderLabel(item)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <CommandInput placeholder="Filter items..." />
    </Command>
  );
}
