import * as React from 'react';
import type { ClassValue } from 'clsx';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { ContextMenu as ContextMenuPrimitive, DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { Button } from '@taucad/ui/components/button';
import { menuItemIconClass, menuItemLayoutClass, menuItemVariants } from '@taucad/ui/components/menu.variants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { SliderInput, snapToStep } from '#components/ui/slider-input.js';
import type { SliderInputProperties } from '#components/ui/slider-input.js';
import { clamp } from '#utils/number.utils.js';
import { cn } from '@taucad/ui/utils/cn';

export type MenuSliderItemProperties = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
  /** Replaces the arrow keys' default one-`step` change, for example to step further while Shift is held. */
  readonly onStep?: SliderInputProperties['onStep'];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** False when `min` only starts the drag window, so a typed value may go below it. */
  readonly hasMinimum?: boolean;
  /** False when `max` only ends the drag window, so a typed value may go past it. */
  readonly hasMaximum?: boolean;
  /** The unit shown after the value, such as `%`; also read aloud with it. */
  readonly trailingAdornment?: string;
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
  onStep,
  min = 0,
  max = 100,
  step = 1,
  hasMinimum,
  hasMaximum,
  trailingAdornment,
  'aria-label': ariaLabel,
  dataSlot,
}: MenuSliderItemProperties): React.JSX.Element => (
  <SliderInput
    dataSlot={dataSlot}
    value={value}
    min={min}
    max={max}
    hasMinimum={hasMinimum}
    hasMaximum={hasMaximum}
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
    aria-valuetext={trailingAdornment ? `${value}${trailingAdornment}` : undefined}
    onScrubChange={onValueChange}
    onInputCommit={onValueChange}
    onStep={onStep}
    onPointerMove={stopPointerPropagation}
    onPointerUp={stopPointerPropagation}
    onPointerCancel={stopPointerPropagation}
  />
);

type MenuSliderItemAdapterProperties = Omit<MenuSliderItemProperties, 'dataSlot'>;

type MenuSliderRowProperties = MenuSliderItemProperties & {
  readonly item: typeof DropdownMenuPrimitive.Item | typeof ContextMenuPrimitive.Item;
};

/** Keys that, on a highlighted row, start typing in its field; the key itself is typed. */
const typeToEditKey = /^[\d.-]$/;

const preventDefault = (event: { preventDefault: () => void }): void => {
  event.preventDefault();
};

const hasCommandModifier = (event: React.KeyboardEvent): boolean => event.ctrlKey || event.metaKey || event.altKey;

/** Enter commits and Escape reverts in the field, which then blurs; the row takes focus back once it has. */
const returnToRowAfterField = (event: React.KeyboardEvent<HTMLDivElement>): void => {
  const row = event.currentTarget;
  if (event.target === row || (event.key !== 'Enter' && event.key !== 'Escape')) {
    return;
  }
  queueMicrotask(() => {
    if (row.isConnected) {
      row.focus();
    }
  });
};

/**
 * A slider row that is also a menu item, so the menu's arrow keys reach it. On the highlighted row, ←/→ step the value
 * (through `onStep` when given, with Shift) and Enter or a digit types in the field. The pointer stays with
 * `SliderInput`: the row skips Radix's hover highlight, which would pull focus out of a field being typed in.
 */
const MenuSliderRow = ({ item: Item, ...properties }: MenuSliderRowProperties): React.JSX.Element => {
  const {
    value,
    min = 0,
    max = 100,
    step = 1,
    hasMinimum = true,
    hasMaximum = true,
    trailingAdornment = '',
    onValueChange,
    onStep,
    'aria-label': ariaLabel,
  } = properties;

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const row = event.currentTarget;
      if (hasCommandModifier(event)) {
        return;
      }
      if (event.target !== row) {
        // Typing in the field: keep the menu's typeahead from moving focus to another item.
        if (event.key.length === 1) {
          event.stopPropagation();
        }
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        if (onStep) {
          onStep(direction, { shift: event.shiftKey });
          return;
        }
        // Only a declared limit stops a step: past a drag window's end, a value keeps stepping from where it is.
        const nextValue = clamp(
          snapToStep(value + direction * step, step, min),
          hasMinimum ? min : Number.NEGATIVE_INFINITY,
          hasMaximum ? max : Number.POSITIVE_INFINITY,
        );
        if (nextValue !== value) {
          onValueChange?.(nextValue);
        }
        return;
      }
      if (event.key !== 'Enter' && !typeToEditKey.test(event.key)) {
        return;
      }
      const input = row.querySelector<HTMLInputElement>('[data-slot="slider-input-input"]');
      if (!input) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
      }
      event.stopPropagation();
      input.focus();
      input.select();
    },
    [hasMaximum, hasMinimum, max, min, onStep, onValueChange, step, value],
  );

  return (
    <Item
      // The focused row reads its value, so a step is heard; typeahead still matches the label alone.
      aria-label={`${ariaLabel}, ${value}${trailingAdornment}`}
      textValue={ariaLabel}
      className={cn(menuItemVariants(), 'p-0')}
      onSelect={preventDefault}
      onPointerMove={preventDefault}
      onPointerLeave={preventDefault}
      onKeyDownCapture={returnToRowAfterField}
      onKeyDown={handleKeyDown}
    >
      <MenuSliderItem {...properties} />
    </Item>
  );
};

export const DropdownMenuSliderItem = (properties: MenuSliderItemAdapterProperties): React.JSX.Element => (
  <MenuSliderRow item={DropdownMenuPrimitive.Item} dataSlot='dropdown-menu-slider-item' {...properties} />
);

export const ContextMenuSliderItem = (properties: MenuSliderItemAdapterProperties): React.JSX.Element => (
  <MenuSliderRow item={ContextMenuPrimitive.Item} dataSlot='context-menu-slider-item' {...properties} />
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
        {/* oxlint-disable-next-line jsx-a11y/role-has-required-aria-props -- the ComboBoxResponsive trigger sets aria-expanded and aria-controls */}
        <Button variant='outline' size='sm' className='h-7 gap-1 px-2 text-xs' role='combobox'>
          {getOptionLabel(value)}
          <ChevronDownIcon className='size-3 opacity-50' />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
};
