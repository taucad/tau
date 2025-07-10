import type { JSX } from 'react';
import { Slider } from '~/components/ui/slider.js';
import { ChatParametersInputNumber } from '~/routes/builds_.$id/chat-parameters-input-number.js';
import { cn } from '~/utils/ui.js';

/**
 * Calculate appropriate step value for slider based on the default parameter value
 * Uses logarithmic scaling to determine the order of magnitude and set precision accordingly
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated step value
 */
const calculateSliderStep = (defaultValue: number): number => {
  if (defaultValue === 0) {
    return 0.01;
  }

  const absoluteValue = Math.abs(defaultValue);

  // Calculate step using order of magnitude
  const orderOfMagnitude = Math.floor(Math.log10(absoluteValue));
  const step = 10 ** orderOfMagnitude;

  // Ensure step is never larger than 1 and never smaller than a reasonable minimum
  return Math.min(1, Math.max(step, 0.000_001));
};

/**
 * Calculate appropriate maximum value for slider based on the default parameter value
 * Handles the case when defaultValue is 0 by providing a reasonable default range
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated maximum value
 */
const calculateSliderMax = (defaultValue: number): number => {
  if (defaultValue === 0) {
    return 100; // Provide a reasonable default range for zero values
  }

  const absoluteValue = Math.abs(defaultValue);

  // For positive values, multiply by 4 to give a good range
  // For negative values, we want the positive range to be 4 times the absolute value
  return absoluteValue * 4;
};

type ChatParametersNumberProps = {
  readonly value: number;
  readonly defaultValue: number;
  readonly onChange: (value: number) => void;
  readonly name: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
};

export function ChatParametersNumber({
  value,
  defaultValue,
  onChange,
  name,
  min,
  max,
  step,
}: ChatParametersNumberProps): JSX.Element {
  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Slider
        value={[value]}
        min={min ?? 0}
        max={max ?? calculateSliderMax(defaultValue)}
        step={step ?? calculateSliderStep(defaultValue)}
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
        <ChatParametersInputNumber
          value={value}
          name={name}
          className="h-7 w-12 bg-background px-2"
          onChange={(event) => {
            onChange(Number.parseFloat(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
