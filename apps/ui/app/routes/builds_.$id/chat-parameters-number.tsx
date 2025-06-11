import type { JSX } from 'react';
import { Input } from '~/components/ui/input.js';
import { Slider } from '~/components/ui/slider.js';
import { cn } from '~/utils/ui.js';

/**
 * Calculate appropriate step value for slider based on the default parameter value
 * Uses logarithmic scaling to ensure precision for values of different magnitudes
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated step value
 */
const calculateSliderStep = (defaultValue: number): number => {
  if (defaultValue === 0) return 0.01;

  const absoluteValue = Math.abs(defaultValue);

  // Define step thresholds based on order of magnitude
  if (absoluteValue >= 1) return 1;
  if (absoluteValue >= 0.1) return 0.1;
  if (absoluteValue >= 0.01) return 0.01;
  if (absoluteValue >= 0.001) return 0.001;
  if (absoluteValue >= 0.0001) return 0.0001;
  if (absoluteValue >= 0.000_01) return 0.000_01;

  // For very small values, continue the pattern
  const orderOfMagnitude = Math.floor(Math.log10(absoluteValue));
  const step = 10 ** orderOfMagnitude;

  // Ensure step is never larger than 1 and never smaller than a reasonable minimum
  return Math.min(1, Math.max(step, 0.000_001));
};

type ChatParametersNumberProps = {
  readonly value: number;
  readonly defaultValue: number;
  readonly onChange: (value: number) => void;
};

export function ChatParametersNumber({ value, defaultValue, onChange }: ChatParametersNumberProps): JSX.Element {
  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Slider
        value={[value]}
        min={0}
        max={defaultValue * 4 || 100}
        step={calculateSliderStep(defaultValue)}
        className={cn(
          'flex-1',
          '[&_[data-slot="slider-track"]]:h-4',
          '[&_[data-slot="slider-track"]]:rounded-md',
          '[&_[data-slot="slider-thumb"]]:size-5.5',
          '[&_[data-slot="slider-thumb"]]:border-1',
          '[&_[data-slot="slider-thumb"]]:transition-transform',
          '[&_[data-slot="slider-thumb"]]:hover:scale-110',
          '[&_[data-slot="slider-track"]]:bg-muted',
        )}
        onValueChange={([newValue]) => {
          onChange(Number(newValue));
        }}
      />
      <div className="flex flex-row items-center">
        <Input
          value={value}
          className="h-6 w-12 bg-background p-1"
          onChange={(event) => {
            onChange(Number.parseFloat(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
