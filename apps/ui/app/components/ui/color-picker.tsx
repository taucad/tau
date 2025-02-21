import { forwardRef, useState } from 'react';
import { HslColor, HslColorPicker } from 'react-colorful';
import { cn } from '@/utils/ui';
import type { ButtonProperties } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Slot } from '@radix-ui/react-slot';

export type ColorPickerValue = HslColor;

interface ColorPickerProperties {
  value: ColorPickerValue;
  onChange: (value: ColorPickerValue) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
  asChild?: boolean;
  disableSaturation?: boolean;
}

const ColorPicker = forwardRef<
  HTMLInputElement,
  Omit<ButtonProperties, 'value' | 'onChange' | 'onBlur'> & ColorPickerProperties
>(
  (
    { disabled, value, onChange, onBlur, name, className, asChild, disableSaturation, ...properties },
    forwardedReference,
  ) => {
    const [open, setOpen] = useState(false);

    const Comp = asChild ? Slot : Button;

    const handleChange = (value: HslColor) => {
      onChange(value);
    };

    return (
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
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
        </PopoverTrigger>
        <PopoverContent side="right" className="w-full">
          <HslColorPicker
            className={cn(
              'mb-2',
              // Disable the saturation picker
              ':hidden',
              '[*]:bg-yellow',
              disableSaturation && 'h',
              // Change the background color of the picker
              'first:hidden',
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
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };
