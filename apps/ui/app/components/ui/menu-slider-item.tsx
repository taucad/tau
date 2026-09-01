import * as React from 'react';
import type { ClassValue } from 'clsx';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { menuItemIconClass, menuItemLayoutClass, menuItemVariants } from '@taucad/ui/components/menu.variants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { SliderInput } from '#components/ui/slider-input.js';
import { cn } from '@taucad/ui/utils/cn';

export type MenuSliderItemProperties = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly trailingAdornment?: React.ReactNode;
  readonly 'aria-label': string;
  readonly dataSlot: string;
};

export const preventMenuSliderEscapeDismissal = (event: { preventDefault: () => void }): void => {
  const { activeElement } = document;
  if (activeElement instanceof HTMLInputElement && activeElement.dataset['slot'] === 'slider-input-input') {
    event.preventDefault();
  }
};

const stopPointerPropagation = (event: React.PointerEvent<HTMLDivElement>): void => {
  event.stopPropagation();
};

export const MenuSliderItem = ({
  className,
  children,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  trailingAdornment,
  'aria-label': ariaLabel,
  dataSlot,
}: MenuSliderItemProperties): React.JSX.Element => (
  <SliderInput
    dataSlot={dataSlot}
    value={value}
    min={min}
    max={max}
    step={step}
    leadingContent={children}
    trailingAdornment={
      trailingAdornment ? (
        <span aria-hidden='true' className='ml-0.5 text-muted-foreground'>
          {trailingAdornment}
        </span>
      ) : undefined
    }
    className={cn(menuItemVariants(), 'w-full focus-within:text-foreground', className)}
    aria-label={ariaLabel}
    onScrubChange={onValueChange}
    onInputCommit={onValueChange}
    onPointerDown={stopPointerPropagation}
    onPointerMove={stopPointerPropagation}
    onPointerUp={stopPointerPropagation}
    onPointerCancel={stopPointerPropagation}
  />
);

type MenuSliderItemAdapterProperties = Omit<MenuSliderItemProperties, 'dataSlot'>;

export const DropdownMenuSliderItem = (properties: MenuSliderItemAdapterProperties): React.JSX.Element => (
  <MenuSliderItem dataSlot='dropdown-menu-slider-item' {...properties} />
);

export const ContextMenuSliderItem = (properties: MenuSliderItemAdapterProperties): React.JSX.Element => (
  <MenuSliderItem dataSlot='context-menu-slider-item' {...properties} />
);

type DropdownMenuSelectItemProperties<T> = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly infoTooltip?: React.ReactNode;
  readonly value: T;
  readonly options: T[];
  readonly getOptionValue: (option: T) => string;
  readonly getOptionLabel: (option: T) => string;
  readonly renderOption?: (option: T, isSelected: boolean) => React.ReactNode;
  readonly onValueChange?: (value: string) => void;
  readonly title?: string;
  readonly description?: string;
  readonly selectPopoverContentClassName?: ClassValue;
  readonly shouldCloseOnSelect?: (value: string) => boolean;
};

export const DropdownMenuSelectItem = <T,>({
  className,
  children,
  infoTooltip,
  value,
  options,
  getOptionValue,
  getOptionLabel,
  renderOption,
  onValueChange,
  title = 'Select option',
  description = 'Choose from available options',
  selectPopoverContentClassName,
  shouldCloseOnSelect,
}: DropdownMenuSelectItemProperties<T>): React.JSX.Element => {
  const groupedItems = React.useMemo(() => [{ name: '', items: options }], [options]);
  const renderLabel = React.useCallback(
    // oxlint-disable-next-line @typescript-eslint/promise-function-async -- ReactNode includes promises, but menu labels render synchronously.
    (item: T, selectedItem: T | undefined) => {
      const isSelected = selectedItem !== undefined && getOptionValue(item) === getOptionValue(selectedItem);

      if (renderOption) {
        return renderOption(item, isSelected);
      }

      return (
        <span className='flex w-full items-center justify-between'>
          <span>{getOptionLabel(item)}</span>
          {isSelected ? <CheckIcon className='size-4' /> : null}
        </span>
      );
    },
    [getOptionLabel, getOptionValue, renderOption],
  );

  return (
    <div
      data-slot='dropdown-menu-select-item'
      className={cn('flex items-center justify-between px-3 py-1.5', className)}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <span className={cn(menuItemLayoutClass, menuItemIconClass, 'text-sm')}>
        {children}
        {infoTooltip}
      </span>
      <ComboBoxResponsive
        isNested
        groupedItems={groupedItems}
        value={value}
        getValue={getOptionValue}
        renderLabel={renderLabel}
        title={title}
        description={description}
        isSearchEnabled={false}
        popoverProperties={{
          align: 'end',
          side: 'bottom',
          sideOffset: 4,
          ...(selectPopoverContentClassName === undefined ? {} : { className: cn(selectPopoverContentClassName) }),
        }}
        shouldCloseOnSelect={shouldCloseOnSelect}
        onSelect={onValueChange}
      >
        <Button variant='outline' size='sm' className='h-7 gap-1 px-2 text-xs' role='combobox'>
          {getOptionLabel(value)}
          <ChevronDownIcon className='size-3 opacity-50' />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
};
