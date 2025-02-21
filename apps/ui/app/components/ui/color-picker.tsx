import { forwardRef, useState } from 'react';
import { HslColor, HslColorPicker } from 'react-colorful';
import { cn } from '@/utils/ui';
import type { ButtonProperties } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Slot } from '@radix-ui/react-slot';
import { RotateCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export type ColorPickerValue = HslColor;

interface ColorPickerProperties {
  value: ColorPickerValue;
  onChange: (value: ColorPickerValue) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
  asChild?: boolean;
  disableSaturation?: boolean;
  onReset?: () => void;
}

const ColorPicker = forwardRef<
  HTMLInputElement,
  Omit<ButtonProperties, 'value' | 'onChange' | 'onBlur'> & ColorPickerProperties
>(
  (
    { disabled, value, onChange, onBlur, name, className, asChild, disableSaturation, onReset, ...properties },
    forwardedReference,
  ) => {
    const [open, setOpen] = useState(false);

    const Comp = asChild ? Slot : Button;

    const handleChange = (value: HslColor) => {
      onChange(value);
    };

    return (
      <Popover onOpenChange={setOpen} open={open}>
        <Tooltip>
          <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
            <TooltipTrigger asChild>
              <Comp
                {...properties}
                className={cn('block', className)}
                name={name}
                onClick={() => {
                  setOpen(true);
                }}
                size="icon"
                data-color-h={value.h}
                data-color-s={value.s}
                data-color-l={value.l}
                variant="outline"
              />
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side="right">Choose theme color</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" className="w-full flex flex-col gap-2">
          <HslColorPicker
            className={cn(
              // Disable the saturation picker
              disableSaturation && '',
              // Change the background color of the picker
              'bg-yellow',
              // '[&_.react-colorful__saturation]:rounded-none!',
              // '[&_.react-colorful__last-control]:rounded-md!',
            )}
            color={value}
            onChange={handleChange}
          />
          <div className="flex items-center gap-2">
            <Input
              min={0}
              max={360}
              type="number"
              onChange={(event) => {
                handleChange({ h: Number(event?.currentTarget?.value), s: 50, l: 50 });
              }}
              ref={forwardedReference}
              value={value.h}
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
  },
);
ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };
