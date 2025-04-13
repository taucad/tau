import React, { useState } from 'react';
import type { ComponentProps, RefObject } from 'react';
import type { HslColor } from 'react-colorful';
import { RotateCcw } from 'lucide-react';
import { ThreeProvider } from '@/components/geometry/graphics/three/three-context.js';
import { CadLoader } from '@/components/geometry/kernel/replicad/cad-loader.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { Slider } from '@/components/ui/slider.js';
import { KeyShortcut } from '@/components/ui/key-shortcut.js';
import { cn } from '@/utils/ui.js';
import { Button } from '@/components/ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { useKeydown } from '@/hooks/use-keydown.js';

export type ColorPickerValue = HslColor;

type ColorPickerProperties = {
  readonly value: ColorPickerValue;
  readonly onChange: (value: ColorPickerValue) => void;
  readonly onBlur?: () => void;
  readonly onReset?: () => void;
  readonly ref?: RefObject<typeof Slider>;
} & Omit<ComponentProps<typeof Button>, 'value' | 'onChange' | 'onBlur' | 'ref'>;

function ColorPicker({
  disabled,
  value,
  onChange,
  onBlur,
  name,
  className,
  onReset,
  ref,
  ...properties
}: Omit<React.ComponentProps<typeof Button>, 'value' | 'onChange' | 'onBlur'> & ColorPickerProperties) {
  const [open, setOpen] = useState(false);

  const handleChange = (value: HslColor) => {
    onChange(value);
  };

  const { formattedKeyCombination } = useKeydown(
    {
      key: 'i',
      metaKey: true,
    },
    () => {
      setOpen((previous) => !previous);
    },
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
          <TooltipTrigger asChild>
            <Button
              {...properties}
              className={cn('block', className)}
              name={name}
              size="icon"
              data-color-h={value.h}
              data-color-s={value.s}
              data-color-l={value.l}
              variant="outline"
              onClick={() => {
                setOpen(true);
              }}
            />
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipContent side="right">
          Choose color{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="right" className="flex w-48 flex-col gap-2 p-2">
        <ThreeProvider
          className={cn(className, 'p-0')}
          stageOptions={{
            perspective: {
              zoomLevel: 1.75,
            },
            rotation: {
              side: -(Math.PI * 4) / 6,
              vertical: Math.PI / 6,
            },
          }}
          frameloop="always"
        >
          <CadLoader action="Running" />
        </ThreeProvider>
        <div className="flex w-full flex-row gap-2">
          <Slider
            ref={ref}
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
              handleChange({ h, s: 50, l: 50 });
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onReset}>
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}

ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };
