import { forwardRef, useState } from 'react';
import { HslColor } from 'react-colorful';
import { cn } from '@/utils/ui';
import type { ButtonProperties } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slot } from '@radix-ui/react-slot';
import { RotateCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Slider } from './slider';
import { useKeydown } from '@/hooks/use-keydown';
import { KeyShortcut } from './key-shortcut';
import { ThreeProvider } from '../geometry/graphics/three/three-context';
import { CadLoader } from '../geometry/kernel/replicad/cad-loader';

export type ColorPickerValue = HslColor;

interface ColorPickerProperties {
  value: ColorPickerValue;
  onChange: (value: ColorPickerValue) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
  asChild?: boolean;
  onReset?: () => void;
}

const ColorPicker = forwardRef<
  HTMLInputElement,
  Omit<ButtonProperties, 'value' | 'onChange' | 'onBlur'> & ColorPickerProperties
>(({ disabled, value, onChange, onBlur, name, className, asChild, onReset, ...properties }, forwardedReference) => {
  const [open, setOpen] = useState(false);

  const Comp = asChild ? Slot : Button;

  const handleChange = (value: HslColor) => {
    onChange(value);
  };

  const { formattedKeyCombination } = useKeydown(
    {
      key: 'i',
      metaKey: true,
    },
    () => setOpen((previous) => !previous),
  );
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
        <TooltipContent side="right">
          Choose color{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="right" className="w-48 flex flex-col gap-2 p-2">
        <ThreeProvider
          disableGizmo={true}
          disableGrid={true}
          className={cn(className, 'p-0')}
          stageOptions={{
            perspective: {
              sideOffsetRatio: -4.5,
              verticalOffsetRatio: -7,
              zoomLevel: 3.5,
            },
          }}
          frameloop="always"
        >
          <CadLoader action="Running" />
        </ThreeProvider>
        <div className="flex flex-row gap-2 w-full">
          <Slider
            min={0}
            max={360}
            value={[value.h]}
            onValueChange={([h]) => handleChange({ h, s: 50, l: 50 })}
            className={cn(
              '[&_[data-slot="range"]]:bg-transparent',
              '[&_[data-slot="track"]]:bg-[linear-gradient(_to_right,_oklch(var(--l-primary)_var(--c-primary)_0),_oklch(var(--l-primary)_var(--c-primary)_120),_oklch(var(--l-primary)_var(--c-primary)_240),_oklch(var(--l-primary)_var(--c-primary)_360)_)]',
              '[&_[data-slot="track"]]:border-x-[oklch(var(--l-primary)_var(--c-primary)_0)]',
              '[&_[data-slot="track"]]:border-x-9',
              '[&_[data-slot="track"]]:h-6',
              '[&_[data-slot="track"]]:rounded-md',
              '[&_[data-slot="thumb"]]:bg-primary',
              '[&_[data-slot="thumb"]]:size-9',
              '[&_[data-slot="thumb"]]:border-border',
              '[&_[data-slot="thumb"]]:border-2',
            )}
            ref={forwardedReference}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onReset} className="w-12">
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
});
ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };
