import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import type { RgbaColor } from 'react-colorful';
import { parse, converter } from 'culori';
import { Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover.js';
import { Button } from '~/components/ui/button.js';
import { Input } from '~/components/ui/input.js';
import { cn } from '~/utils/ui.js';

type StringColorPickerProperties = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
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
 * Convert any valid CSS color to RGBA object for react-colorful
 */
const convertToRgba = (color: string): RgbaColor => {
  try {
    const parsed = parse(color);
    if (parsed) {
      // Convert to RGB space using culori
      const rgbColor = rgbConverter(parsed);
      if (rgbColor) {
        return {
          r: Math.round((rgbColor.r ?? 0) * 255),
          g: Math.round((rgbColor.g ?? 0) * 255),
          b: Math.round((rgbColor.b ?? 0) * 255),
          a: rgbColor.alpha ?? 1,
        };
      }
    }
  } catch {
    // Fallback if conversion fails
  }

  return { r: 0, g: 0, b: 0, a: 1 }; // Default fallback
};

/**
 * Convert RGBA object back to CSS color string using culori
 * Returns simple RGBA format with rounded values
 */
const rgbaToString = (rgba: RgbaColor): string => {
  // Return simple RGBA format with rounded values
  const r = Math.round(rgba.r);
  const g = Math.round(rgba.g);
  const b = Math.round(rgba.b);
  const a = Math.round(rgba.a * 1000) / 1000; // Round alpha to 3 decimal places

  return `rgba(${r},${g},${b},${a})`;
};

/**
 * Detect the color format type from a color string using culori's parse API
 */
// eslint-disable-next-line complexity -- allowable
const getColorFormat = (color: string): string => {
  try {
    const parsed = parse(color);
    if (!parsed) return '';

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

      case 'lab': {
        return 'LAB';
      }

      case 'lch': {
        return 'LCH';
      }

      case 'oklch': {
        return 'OKLCH';
      }

      case 'oklab': {
        return 'OKLAB';
      }

      case 'hwb': {
        return 'HWB';
      }

      case 'hsv': {
        return 'HSV';
      }

      case 'hsi': {
        return 'HSI';
      }

      case 'xyz50':
      case 'xyz65': {
        return 'XYZ';
      }

      case 'p3': {
        return 'P3';
      }

      case 'a98': {
        return 'A98';
      }

      case 'rec2020': {
        return 'REC2020';
      }

      case 'prophoto': {
        return 'PROPHOTO';
      }

      case 'cubehelix': {
        return 'CUBEHELIX';
      }

      case 'yiq': {
        return 'YIQ';
      }

      case 'luv': {
        return 'LUV';
      }

      case 'lchuv': {
        return 'LCHUV';
      }

      case 'jab': {
        return 'JAB';
      }

      case 'jch': {
        return 'JCH';
      }

      case 'xyb': {
        return 'XYB';
      }

      case 'dlab': {
        return 'DLAB';
      }

      case 'dlch': {
        return 'DLCH';
      }

      case 'lrgb': {
        return 'LRGB';
      }

      case 'lab65': {
        return 'LAB65';
      }

      case 'lch65': {
        return 'LCH65';
      }

      case 'okhsl': {
        return 'OKHSL';
      }

      case 'okhsv': {
        return 'OKHSV';
      }

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check
      default: {
        const _exhaustiveCheck: never = mode;
        throw new Error(`Unknown color format: ${String(_exhaustiveCheck)}`);
      }
    }
  } catch {
    // Fallback if parsing fails
    return '';
  }
};

// Base indicator class matching ChatParametersInputNumber styling
const baseIndicatorClass = 'flex h-6 w-6 items-center justify-center border bg-muted text-muted-foreground select-none';

/**
 * String Color Picker Component
 * Uses react-colorful for color selection with RGBA values
 */
export function StringColorPicker({ value, onChange, className }: StringColorPickerProperties): JSX.Element {
  const [open, setOpen] = useState(false);
  const [temporaryColor, setTemporaryColor] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state with external value changes (e.g., when parameter is reset)
  useEffect(() => {
    setTemporaryColor(value);
  }, [value]);

  const isValid = isValidColor(value);
  const rgbaValue = isValid ? convertToRgba(value) : { r: 0, g: 0, b: 0, a: 1 };
  const colorFormat = getColorFormat(value);

  const handleColorChange = useCallback(
    (newColor: RgbaColor) => {
      const colorString = rgbaToString(newColor);
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

  const handleIndicatorClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={cn('flex w-full flex-row items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-6 w-8 p-0"
            style={{ backgroundColor: isValid ? value : 'transparent' }}
            aria-label="Open color picker"
          >
            {!isValid && <span className="text-xs text-muted-foreground">?</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-70 p-3" side="right" align="end">
          <div className="space-y-3">
            <RgbaColorPicker color={rgbaValue} className="!h-48 !w-full" onChange={handleColorChange} />
            <div className="relative">
              <div
                className="absolute top-px bottom-px left-px w-8 overflow-clip rounded-l border-r border-border bg-clip-padding"
                style={{ backgroundColor: isValidColor(temporaryColor) ? temporaryColor : 'transparent' }}
              >
                {!isValidColor(temporaryColor) && (
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    ?
                  </span>
                )}
              </div>
              <Input
                type="text"
                value={temporaryColor}
                placeholder="Pick a color"
                className="h-8 pr-8 pl-10 font-mono"
                onChange={handlePopoverInputChange}
              />
              <div className="absolute top-0 right-2 bottom-0 rounded-r">
                {isValidColor(temporaryColor) ? (
                  <div className="flex h-full w-full items-center justify-center rounded-r text-success">
                    <Check className="size-4" />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-r text-destructive">
                    <X className="size-4" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div
        className={cn(
          'group relative flex flex-1 flex-row items-center rounded-md',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        )}
      >
        <Input
          ref={inputRef}
          autoComplete="off"
          type="text"
          value={value}
          className="h-6 flex-1 rounded-r-none border-r-0 bg-background p-1 font-mono text-sm focus-visible:ring-0"
          placeholder="Color value"
          onChange={handleMainInputChange}
        />
        {colorFormat ? (
          <span
            className={cn(
              baseIndicatorClass,
              'rounded-r-md border-l-0',
              'group-focus-within:border-ring',
              'cursor-text',
            )}
            onClick={handleIndicatorClick}
          >
            <span className="font-mono text-[0.5rem] uppercase">{colorFormat}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
