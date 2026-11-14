import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive, DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { menuItemIconClass, menuItemLayoutClass, menuItemVariants } from '#components/menu.variants.js';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '#components/dropdown-menu.js';
import { useIsDropdownMenuDrawer } from '#hooks/dropdown-menu-drawer.js';
import { drawerRowAttributes } from '#components/drawer.js';
import { SliderInput, snapToStep } from '#components/slider-input.js';
import type { SliderInputProperties } from '#components/slider-input.js';
import { cn } from '#utils/cn.js';
import { clamp } from '#utils/number.js';

/**
 * Properties of {@link MenuSliderItem}.
 *
 * @public
 */
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

/**
 * Keep a menu open when Escape leaves a slider row's text field rather than the menu.
 *
 * @param event - The menu's escape event.
 *
 * @public
 */
export const preventMenuSliderEscapeDismissal = (event: { preventDefault: () => void }): void => {
  const { activeElement } = document;
  if (activeElement instanceof HTMLInputElement && activeElement.dataset['slot'] === 'slider-input-input') {
    event.preventDefault();
  }
};

const stopPointerPropagation = (event: React.PointerEvent<HTMLDivElement>): void => {
  event.stopPropagation();
};

/**
 * A menu row holding a labelled {@link SliderInput}; pointer and key events stay in the slider instead of driving the menu.
 *
 * @param props - The label, value, range and change handlers.
 * @returns The slider row.
 *
 * @public
 */
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

type DropdownMenuSliderItemProperties = MenuSliderItemAdapterProperties & {
  /** Start the label where an indicator row's text starts (a radio or checkbox row), as an inset menu item does. */
  readonly isInset?: boolean;
};

/**
 * A slider row in a responsive menu's phone drawer: a touch row with the drawer's geometry, its slider an inset
 * surface where a row's highlight would sit, so its label lines up with the other rows' icons and text. The row is not
 * a menu item (a drawer has no menu), draws no highlight and no divider of its own (its surface frames it), and a drag
 * on it scrubs the value instead of moving the sheet.
 */
const DrawerSliderRow = ({
  className,
  isInset = false,
  ...properties
}: MenuSliderItemProperties & { readonly isInset?: boolean }): React.JSX.Element => (
  <div
    {...drawerRowAttributes}
    data-vaul-no-drag=''
    className={cn(
      'relative flex shrink-0 items-center px-1.5 py-0.5 [--drawer-row-highlight:transparent] before:content-none!',
      '[--drawer-row-gap:0.75rem] [--drawer-row-icon:1rem] [--drawer-row-inset:1rem]',
    )}
  >
    <MenuSliderItem
      {...properties}
      className={cn(
        'min-h-[calc(var(--spacing-touch-row)-0.25rem)] rounded-md px-2.5 text-sm pointer-coarse:min-h-[calc(var(--spacing-touch-row)-0.25rem)]',
        "[&_svg:not([class*='size-'])]:size-4",
        // An indicator row's text starts 2.75rem in; the row's own 0.375rem inset comes first.
        isInset && 'pl-[2.375rem]',
        className,
      )}
    />
  </div>
);

/**
 * {@link MenuSliderItem} inside a dropdown menu. In a responsive menu's phone drawer it is a touch row instead.
 *
 * @public
 */
export const DropdownMenuSliderItem = ({
  isInset = false,
  ...properties
}: DropdownMenuSliderItemProperties): React.JSX.Element => {
  const isInDrawer = useIsDropdownMenuDrawer();
  if (isInDrawer) {
    return <DrawerSliderRow dataSlot='dropdown-menu-slider-item' isInset={isInset} {...properties} />;
  }
  return (
    <MenuSliderRow
      item={DropdownMenuPrimitive.Item}
      dataSlot='dropdown-menu-slider-item'
      {...properties}
      // The menu's inset, as `menuItemVariants({ inset: true })` gives an indicator row.
      className={cn(isInset && 'pl-8', properties.className)}
    />
  );
};

/**
 * {@link MenuSliderItem} inside a context menu.
 *
 * @public
 */
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
  /** The sub-view's title, which names its group for assistive technology; defaults to the row's text. */
  readonly title?: string;
  /**
   * Whether choosing a value steps back to the menu. Return false to stay on the options. Defaults to stepping back.
   */
  readonly shouldCloseOnSelect?: (value: string) => boolean;
};

/**
 * A dropdown-menu row naming a setting and its value, whose options open as a sub-view of the menu (UX policy §7):
 * choosing one steps back to the row, and the menu stays open.
 *
 * @param props - The label, options, value and change handler.
 * @returns The select row.
 *
 * @public
 */
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
  title,
  shouldCloseOnSelect,
}: DropdownMenuSelectItemProperties<T>): React.JSX.Element => {
  const [isOpen, setOpen] = React.useState(false);
  const selected = getOptionValue(value);
  const label = getOptionLabel(value);
  return (
    <DropdownMenuSub open={isOpen} onOpenChange={setOpen}>
      <DropdownMenuSubTrigger
        data-slot='dropdown-menu-select-item'
        className={className}
        {...(title === undefined ? {} : { textValue: title })}
      >
        <span className={cn(menuItemLayoutClass, menuItemIconClass, 'min-w-0')}>
          {children}
          {infoTooltip}
        </span>
        <span className='ml-auto truncate pl-3 text-muted-foreground'>{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent {...(title === undefined ? {} : { title })}>
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(next) => {
            onValueChange?.(next);
            if (shouldCloseOnSelect?.(next) ?? true) {
              setOpen(false);
            }
          }}
        >
          {options.map((option) => {
            const optionValue = getOptionValue(option);
            return (
              <DropdownMenuRadioItem
                key={optionValue}
                value={optionValue}
                onSelect={(event) => {
                  // A value is a setting, not a command: the menu stays open.
                  event.preventDefault();
                }}
              >
                {renderOption ? renderOption(option, optionValue === selected) : getOptionLabel(option)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
