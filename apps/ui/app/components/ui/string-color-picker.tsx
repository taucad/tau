import React, { useState, useCallback, useEffect } from 'react';
import { RgbColorPicker } from 'react-colorful';
import type { RgbColor } from 'react-colorful';
import { parse, converter } from 'culori';
import { Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { cn } from '#utils/ui.utils.js';

type StringColorPickerProperties = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly autoFocus?: boolean;
  readonly 'aria-label'?: string;
  readonly onFocus?: React.FocusEventHandler<HTMLInputElement>;
  readonly onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const rgbConverter = converter('rgb');

/**
 * Check if a string is a valid CSS color using culori
 * Supports all CSS color formats including hex, rgb, rgba, hsl, hsla, named colors, lab, oklch, etc.
 */
export const isValidColor = (color: string): boolean => {
  return parse(color) !== undefined;
};

/**
 * Convert any valid CSS color to RGB object for react-colorful
 */
const convertToRgb = (color: string): RgbColor => {
  try {
    const parsed = parse(color);
    if (parsed) {
      // Convert to RGB space using culori
      const rgbColor = rgbConverter(parsed);
      return {
        r: Math.round(rgbColor.r * 255),
        g: Math.round(rgbColor.g * 255),
        b: Math.round(rgbColor.b * 255),
      };
    }
  } catch {
    // Fallback if conversion fails
  }

  return { r: 0, g: 0, b: 0 }; // Default fallback
};

/**
 * Convert RGB object to hex color string
 * Always returns 6-digit hex (#RRGGBB)
 */
const rgbToHex = (rgb: RgbColor): string => {
  const toHex = (value: number): string => {
    const hex = Math.round(Math.max(0, Math.min(255, value))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const r = toHex(rgb.r);
  const g = toHex(rgb.g);
  const b = toHex(rgb.b);

  return `#${r}${g}${b}`;
};

/**
 * Detect the color format type from a color string using culori's parse API
 */

const getColorFormat = (color: string): string => {
  try {
    const parsed = parse(color);
    if (!parsed) {
      return '';
    }

    // Map culori color modes to display-friendly format names
    const { mode } = parsed;
    switch (mode) {
      case 'rgb': {
        // Check if original string is hex format first
        const trimmedColor = color.trim().toLowerCase();
        if (trimmedColor.startsWith('#')) {
          return 'HEX';
        }

        // Check if original string has alpha to distinguish RGB vs RGBA
        return color.trim().toLowerCase().startsWith('rgba(') ? 'RGBA' : 'RGB';
      }

      case 'hsl': {
        // Check if original string has alpha to distinguish HSL vs HSLA
        return color.trim().toLowerCase().startsWith('hsla(') ? 'HSLA' : 'HSL';
      }

      default: {
        return mode.toUpperCase();
      }
    }
  } catch {
    // Fallback if parsing fails
    return '';
  }
};

const baseIndicatorClass =
  'flex h-(--param-field-h) w-6 items-center justify-center text-muted-foreground/60 select-none';

/**
 * String Color Picker Component
 * Uses react-colorful for color selection with RGB values (no alpha)
 */
export function StringColorPicker({
  value,
  onChange,
  className,
  id,
  disabled,
  readOnly,
  autoFocus,
  'aria-label': ariaLabel,
  onFocus,
  onBlur,
}: StringColorPickerProperties): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [temporaryColor, setTemporaryColor] = useState(value);

  // Sync internal state with external value changes (e.g., when parameter is reset)
  useEffect(() => {
    setTemporaryColor(value);
  }, [value]);

  const isValid = isValidColor(value);
  const rgbValue = isValid ? convertToRgb(value) : { r: 0, g: 0, b: 0 };
  const colorFormat = getColorFormat(value);

  const handleColorChange = useCallback(
    (newColor: RgbColor) => {
      const colorString = rgbToHex(newColor);
      setTemporaryColor(colorString);
      onChange(colorString);
    },
    [onChange],
  );

  const handlePopoverInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      setTemporaryColor(newValue);
      if (isValidColor(newValue) || newValue === '') {
        onChange(newValue);
      }
    },
    [onChange],
  );

  const handleMainInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      // Only update temporaryColor if the popover is open
      if (open) {
        setTemporaryColor(newValue);
      }

      onChange(newValue);
    },
    [onChange, open],
  );

  return (
    <div className={cn('group/color-picker flex w-full flex-row items-center gap-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            disabled={disabled || readOnly}
            className='h-(--param-field-h) w-(--param-field-h) shrink-0 rounded-(--param-field-radius) border-border/50 p-0 opacity-70 shadow-none transition-opacity hover:border-border hover:opacity-100'
            style={{ backgroundColor: isValid ? value : 'transparent' }}
            aria-label='Open color picker'
          >
            {!isValid && <span className='text-xs text-muted-foreground'>?</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-70 p-3' side='right' align='end'>
          <div className='space-y-3'>
            <RgbColorPicker color={rgbValue} className='!h-48 !w-full' onChange={handleColorChange} />
            <div className='relative'>
              <div
                className='absolute top-px bottom-px left-px w-8 overflow-clip rounded-l-sm border-r border-border bg-clip-padding'
                style={{ backgroundColor: isValidColor(temporaryColor) ? temporaryColor : 'transparent' }}
              >
                {!isValidColor(temporaryColor) && (
                  <span className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-muted-foreground'>
                    ?
                  </span>
                )}
              </div>
              <Input
                type='text'
                value={temporaryColor}
                disabled={disabled}
                readOnly={readOnly}
                placeholder='Pick a color'
                className='h-7 pr-8 pl-10 font-mono'
                onChange={handlePopoverInputChange}
              />
              <div className='pointer-events-none absolute top-0 right-2 bottom-0 rounded-r'>
                {isValidColor(temporaryColor) ? (
                  <div className='flex h-full w-full items-center justify-center rounded-r text-success'>
                    <Check className='size-4' />
                  </div>
                ) : (
                  <div className='flex h-full w-full items-center justify-center rounded-r text-destructive'>
                    <X className='size-4' />
                  </div>
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className='group relative flex min-w-0 flex-1 flex-row items-center'>
        <Input
          id={id}
          autoFocus={autoFocus}
          autoComplete='off'
          type='text'
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          className='h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted px-2 pr-6 text-right font-mono text-sm text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus)'
          placeholder='Color value'
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={handleMainInputChange}
        />
        {colorFormat ? (
          <span className={cn(baseIndicatorClass, 'pointer-events-none absolute right-0')}>
            <span
              className={cn(
                'font-mono text-[8px] leading-none uppercase',
                colorFormat.length <= 2
                  ? 'tracking-wide'
                  : colorFormat.length <= 3
                    ? 'tracking-normal'
                    : 'tracking-tight',
              )}
            >
              {colorFormat}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
