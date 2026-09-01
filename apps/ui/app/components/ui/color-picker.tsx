import React, { useState } from 'react';
import type { ReactNode } from 'react';
import type { HslColor } from 'react-colorful';
import { Pipette, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Slider } from '@taucad/ui/components/slider';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cn } from '@taucad/ui/utils/cn';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { useKeybinding } from '#hooks/use-keyboard.js';

export type ColorPickerValue = HslColor;

type ColorPickerProperties = {
  readonly value: ColorPickerValue;
  readonly onChange: (value: ColorPickerValue) => void;
  readonly onBlur?: () => void;
  readonly onReset?: () => void;
  readonly children?: ReactNode;
  readonly isDisabled?: boolean;
  readonly className?: string;
  readonly hasTooltip?: boolean;
  readonly popoverProperties?: React.ComponentProps<typeof PopoverContent>;
};

function ColorPicker({
  value,
  onChange,
  onBlur,
  onReset,
  children,
  isDisabled,
  className,
  hasTooltip = true,
  popoverProperties,
}: ColorPickerProperties): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const handleChange = (newValue: HslColor) => {
    onChange(newValue);
  };

  const { formattedKeyCombination } = useKeybinding(
    {
      key: 'i',
      modKey: true,
    },
    () => {
      setOpen((previous) => !previous);
    },
  );

  // Default trigger button if no children provided
  const triggerContent = children ?? (
    <Button variant='outline' size='icon' className={cn('block', className)}>
      <Pipette className='size-4' />
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {hasTooltip ? (
        <Tooltip>
          <PopoverTrigger asChild disabled={isDisabled} onBlur={onBlur}>
            <TooltipTrigger asChild>{triggerContent}</TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side='top'>
            Choose color{' '}
            <KeyShortcut variant='tooltip' className='ml-1'>
              {formattedKeyCombination}
            </KeyShortcut>
          </TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild disabled={isDisabled} onBlur={onBlur}>
          {triggerContent}
        </PopoverTrigger>
      )}
      <PopoverContent
        side='top'
        {...popoverProperties}
        className={cn('flex w-48 flex-col gap-2 p-2', popoverProperties?.className)}
      >
        <span className='w-full items-center text-sm text-muted-foreground'>Select hue ({value.h}°)</span>
        <div className='flex w-full flex-row gap-2'>
          <Slider
            min={0}
            max={360}
            value={[value.h]}
            className={cn(
              '[&_[data-slot="slider-range"]]:bg-transparent',
              '[&_[data-slot="slider-track"]]:bg-[linear-gradient(_to_right,_oklch(var(--l-primary)_var(--c-primary)_0),_oklch(var(--l-primary)_var(--c-primary)_120),_oklch(var(--l-primary)_var(--c-primary)_240),_oklch(var(--l-primary)_var(--c-primary)_360)_)]',
              '[&_[data-slot="slider-track"]]:border-x-[oklch(var(--l-primary)_var(--c-primary)_0)]',
              '[&_[data-slot="slider-track"]]:border-x-9',
              '[&_[data-slot="slider-track"]]:h-6',
              '[&_[data-slot="slider-track"]]:rounded-md',
              '[&_[data-slot="slider-thumb"]]:bg-primary',
              '[&_[data-slot="slider-thumb"]]:size-9',
              '[&_[data-slot="slider-thumb"]]:border-border',
              '[&_[data-slot="slider-thumb"]]:border-2',
            )}
            onValueChange={([h]) => {
              handleChange({ h: Number(h), s: 50, l: 50 });
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='outline' size='icon' onClick={onReset}>
                <RotateCcw className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset hue</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}

ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };
