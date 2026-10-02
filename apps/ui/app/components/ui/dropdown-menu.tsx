import * as React from 'react';
import type { ClassValue } from 'clsx';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';
import { cn } from '#utils/ui.utils.js';
import { Switch } from '#components/ui/switch.js';
import { Slider } from '#components/ui/slider.js';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Button } from '#components/ui/button.js';
import {
  menuItemVariants,
  menuContentVariants,
  menuLabelVariants,
  menuSeparatorVariants,
  menuSubTriggerOpenClass,
  menuShortcutClass,
  menuSideAlignOffset,
  subMenuSideAlignOffset,
  menuItemLayoutClass,
  menuItemIconClass,
} from '#components/ui/menu.variants.js';

function DropdownMenu({ ...properties }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>): React.JSX.Element {
  return <DropdownMenuPrimitive.Root data-slot='dropdown-menu' {...properties} />;
}

function DropdownMenuPortal({
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>): React.JSX.Element {
  return <DropdownMenuPrimitive.Portal data-slot='dropdown-menu-portal' {...properties} />;
}

function DropdownMenuTrigger({
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>): React.JSX.Element {
  return <DropdownMenuPrimitive.Trigger data-slot='dropdown-menu-trigger' {...properties} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  side,
  alignOffset,
  onClick,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>): React.JSX.Element {
  const resolvedAlignOffset = alignOffset ?? (side === 'left' || side === 'right' ? menuSideAlignOffset : undefined);

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot='dropdown-menu-content'
        sideOffset={sideOffset}
        side={side}
        alignOffset={resolvedAlignOffset}
        className={cn(
          menuContentVariants(),
          'max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
          className,
        )}
        {...properties}
        onClick={(event: React.MouseEvent<HTMLDivElement>) => {
          // Prevent clicks inside portaled dropdown content from bubbling to
          // ancestor DrawerHandle elements, which would cycle snap points via
          // vaul's handleStartCycle.
          event.stopPropagation();
          onClick?.(event);
        }}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>): React.JSX.Element {
  return <DropdownMenuPrimitive.Group data-slot='dropdown-menu-group' {...properties} />;
}

function DropdownMenuItem({
  className,
  isInset,
  variant = 'default',
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  readonly isInset?: boolean;
  readonly variant?: 'default' | 'destructive';
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-item'
      data-inset={isInset}
      data-variant={variant}
      className={cn(menuItemVariants({ variant, inset: isInset }), className)}
      {...properties}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot='dropdown-menu-checkbox-item'
      className={cn(menuItemVariants({ inset: true }), 'pr-2', className)}
      checked={checked}
      {...properties}
    >
      <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className='size-4' />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>): React.JSX.Element {
  return <DropdownMenuPrimitive.RadioGroup data-slot='dropdown-menu-radio-group' {...properties} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot='dropdown-menu-radio-item'
      className={cn(menuItemVariants({ inset: true }), 'pr-2', className)}
      {...properties}
    >
      <span
        data-slot='dropdown-menu-radio-item-indicator'
        className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className='size-2 fill-current' />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuSwitchItem({
  className,
  children,
  isChecked,
  onIsCheckedChange,
  ...properties
}: Omit<React.ComponentProps<typeof DropdownMenuPrimitive.Item>, 'onSelect'> & {
  readonly isChecked: boolean;
  readonly onIsCheckedChange?: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-switch-item'
      className={cn(menuItemVariants(), 'justify-between', className)}
      onSelect={(event) => {
        event.preventDefault();
        onIsCheckedChange?.(!isChecked);
      }}
      {...properties}
    >
      <span className={menuItemLayoutClass}>{children}</span>
      <Switch
        className='data-[state=unchecked]:bg-muted-foreground!'
        checked={isChecked}
        onCheckedChange={onIsCheckedChange}
      />
    </DropdownMenuPrimitive.Item>
  );
}

type DropdownMenuSliderItemProperties = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly infoTooltip?: React.ReactNode;
  readonly formatValue?: (value: number) => string;
};

function DropdownMenuSliderItem({
  className,
  children,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  infoTooltip,
  formatValue,
}: DropdownMenuSliderItemProperties): React.JSX.Element {
  const handleValueChange = React.useCallback(
    (values: number[]) => {
      const newValue = values[0];
      if (newValue !== undefined) {
        onValueChange?.(newValue);
      }
    },
    [onValueChange],
  );

  const displayValue = formatValue ? formatValue(value) : `${value}`;

  return (
    <div
      data-slot='dropdown-menu-slider-item'
      className={cn('px-3 py-2', className)}
      // Prevent dropdown from closing when interacting with slider
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div className='mb-2 flex items-center justify-between'>
        <span className={cn(menuItemLayoutClass, menuItemIconClass, 'text-sm')}>
          {children}
          {infoTooltip}
        </span>
        <span className='text-xs text-muted-foreground'>{displayValue}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} className='w-full' onValueChange={handleValueChange} />
    </div>
  );
}

type ToggleOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
};

type DropdownMenuToggleGroupItemProperties<T extends string> = {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly infoTooltip?: React.ReactNode;
  readonly value: T;
  readonly options: Array<ToggleOption<T>>;
  readonly onValueChange?: (value: T) => void;
};

function DropdownMenuToggleGroupItem<T extends string>({
  className,
  children,
  infoTooltip,
  value,
  options,
  onValueChange,
}: DropdownMenuToggleGroupItemProperties<T>): React.JSX.Element {
  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (newValue) {
        onValueChange?.(newValue as T);
      }
    },
    [onValueChange],
  );

  return (
    <div
      data-slot='dropdown-menu-toggle-group-item'
      className={cn('flex items-center justify-between px-3 py-1.5', className)}
      // Prevent dropdown from closing when interacting with toggle group
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <span className={cn(menuItemLayoutClass, menuItemIconClass, 'text-sm')}>
        {children}
        {infoTooltip}
      </span>
      <ToggleGroup
        type='single'
        variant='outline'
        value={value}
        className='font-semibold'
        onValueChange={handleValueChange}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.ariaLabel ?? option.value}
            className='h-7 flex-1'
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function DropdownMenuLabel({
  className,
  isInset,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  readonly isInset?: boolean;
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Label
      data-slot='dropdown-menu-label'
      data-inset={isInset}
      className={cn(menuLabelVariants({ inset: isInset }), className)}
      {...properties}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot='dropdown-menu-separator'
      className={cn(menuSeparatorVariants(), className)}
      {...properties}
    />
  );
}

function DropdownMenuShortcut({ className, ...properties }: React.ComponentProps<'span'>): React.JSX.Element {
  return <span data-slot='dropdown-menu-shortcut' className={cn(menuShortcutClass, className)} {...properties} />;
}

function DropdownMenuSub({ ...properties }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>): React.JSX.Element {
  return <DropdownMenuPrimitive.Sub data-slot='dropdown-menu-sub' {...properties} />;
}

function DropdownMenuSubTrigger({
  className,
  isInset,
  children,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  readonly isInset?: boolean;
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot='dropdown-menu-sub-trigger'
      data-inset={isInset}
      className={cn(menuItemVariants({ inset: isInset }), menuSubTriggerOpenClass, className)}
      {...properties}
    >
      {children}
      <ChevronRightIcon className='ml-auto size-3.5' />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  alignOffset = subMenuSideAlignOffset,
  ...properties
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot='dropdown-menu-sub-content'
      alignOffset={alignOffset}
      className={cn(
        menuContentVariants(),
        'shadow-lg origin-(--radix-dropdown-menu-content-transform-origin)',
        className,
      )}
      {...properties}
    />
  );
}

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
  /**
   * Merged onto the nested ComboBoxResponsive popover (desktop).
   * Use for min-width / max-width so multi-line rows stay readable.
   */
  readonly selectPopoverContentClassName?: ClassValue;
  /**
   * Passed through to ComboBoxResponsive. Return false to keep the nested popover
   * open after a selection (`chat-parameters.tsx`, `chat-tool-selector.tsx`).
   */
  readonly shouldCloseOnSelect?: (value: string) => boolean;
};

function DropdownMenuSelectItem<T>({
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
}: DropdownMenuSelectItemProperties<T>): React.JSX.Element {
  const groupedItems = React.useMemo(
    () => [
      {
        name: '',
        items: options,
      },
    ],
    [options],
  );

  const renderLabel = React.useCallback(
    // oxlint-disable-next-line @typescript-eslint/promise-function-async -- sync render helper; renderOption cannot return Promise in this synchronous menu context (React.ReactNode includes Promise types in upstream react types)
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
      // Prevent parent dropdown from closing when interacting with select
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
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSwitchItem,
  DropdownMenuSliderItem,
  DropdownMenuSelectItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
