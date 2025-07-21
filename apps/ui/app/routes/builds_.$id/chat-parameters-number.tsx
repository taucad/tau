import { Slider } from '~/components/ui/slider.js';
import { ChatParametersInputNumber } from '~/routes/builds_.$id/chat-parameters-input-number.js';
import { cn } from '~/utils/ui.js';

// Slider calculation constants
/*
 * The multiplier for the slider range.
 * This is the factor by which the default range is multiplied to get the maximum value.
 */
const SliderRangeMultiplier = 4;

/*
 * The default range for zero values.
 * This is the range that is used for zero values.
 */
const DefaultRangeForZero = 100;

/*
 * The minimum step value for the slider.
 * This is the minimum step value that is used for the slider.
 */
const MinStepValue = 0.000_001;

/*
 * The default step value for zero values.
 * This is the step value that is used for zero values.
 */
const DefaultStepForZero = 0.01;

/**
 * Calculate appropriate step value for slider based on the default parameter value
 * Uses logarithmic scaling to determine the order of magnitude and set precision accordingly
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated step value
 */
const calculateSliderStep = (defaultValue: number): number => {
  if (defaultValue === 0) {
    return DefaultStepForZero;
  }

  const absoluteValue = Math.abs(defaultValue);

  // Calculate step using order of magnitude
  const orderOfMagnitude = Math.floor(Math.log10(absoluteValue));
  const step = 10 ** orderOfMagnitude;

  // Ensure step is never larger than 1 and never smaller than a reasonable minimum
  return Math.min(1, Math.max(step, MinStepValue));
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
    return DefaultRangeForZero;
  }

  const absoluteValue = Math.abs(defaultValue);

  // For positive values, multiply by 4 to give a good range
  // For negative values, we want the positive range to be 4 times the absolute value
  return absoluteValue * SliderRangeMultiplier;
};

/**
 * Calculate appropriate minimum value for slider based on the default parameter value
 * For positive values, minimum is 0. For negative values, minimum mirrors the maximum calculation
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated minimum value
 */
const calculateSliderMin = (defaultValue: number): number => {
  if (defaultValue === 0) {
    return -DefaultRangeForZero;
  }

  // For positive values, always set minimum to 0
  if (defaultValue > 0) {
    return 0;
  }

  // For negative values, set minimum to negative equivalent of maximum calculation
  const absoluteValue = Math.abs(defaultValue);
  return -absoluteValue * SliderRangeMultiplier;
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
}: ChatParametersNumberProps): React.JSX.Element {
  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Slider
        value={[value]}
        min={min ?? calculateSliderMin(defaultValue)}
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
