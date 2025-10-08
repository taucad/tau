import { Slider } from '#components/ui/slider.js';
import { ChatParametersInputNumber } from '#routes/builds_.$id/chat-parameters-input-number.js';
import { cn } from '#utils/ui.js';

// Slider calculation constants

/*
 * The default range for zero values.
 * When the default value is 0, we provide a symmetric range from negative to positive.
 */
const DefaultRangeForZero = 100;

/*
 * The multiplier used to test if a default value should get an expanded range.
 * We multiply the default value by this factor and check if it exceeds the tier boundary.
 */
const RangeTestMultiplier = 2;

/*
 * The multiplier applied to tier boundaries when creating expanded ranges.
 * When a default value's doubled value exceeds its tier, the range is expanded by this factor.
 */
const TierExpansionMultiplier = 2;

/*
 * The minimum step value for the slider.
 * This prevents the step from becoming too small and causing precision issues.
 */
const MinStepValue = 0.000_001;

/*
 * The default step value for zero values.
 * Used when the default value is 0 and we need a reasonable step size.
 */
const DefaultStepForZero = 0.01;

/**
 * Calculate the tier boundary for a given value using log10.
 * The tier boundary is the power of 10 that defines the current tier.
 * For example: 60 → tier boundary is 10, 400 → tier boundary is 100
 *
 * @param value - The value to find the tier boundary for
 * @returns The tier boundary (power of 10)
 */
const calculateTierBoundary = (value: number): number => {
  const absoluteValue = Math.abs(value);
  return 10 ** Math.floor(Math.log10(absoluteValue));
};

/**
 * Calculate the range boundary magnitude using tier-based scaling logic.
 * This shared logic determines whether to expand the range based on the 2x test.
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated range boundary (always positive)
 */
const calculateRangeBoundary = (defaultValue: number): number => {
  const absoluteValue = Math.abs(defaultValue);
  const tierBoundary = calculateTierBoundary(absoluteValue);
  const nextTier = tierBoundary * 10;

  // Test if doubled value exceeds the next tier boundary
  const testValue = absoluteValue * RangeTestMultiplier;

  // If test value meets or exceeds the next tier, expand the range
  if (testValue >= nextTier) {
    return nextTier * TierExpansionMultiplier;
  }

  return nextTier;
};

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
 * Uses tier-based scaling: if default*2 exceeds its tier boundary, expand the range
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated maximum value
 */
const calculateSliderMax = (defaultValue: number): number => {
  if (defaultValue === 0) {
    return DefaultRangeForZero;
  }

  // For negative values, max should be 0
  if (defaultValue < 0) {
    return 0;
  }

  // Use shared logic to calculate the positive range boundary
  return calculateRangeBoundary(defaultValue);
};

/**
 * Calculate appropriate minimum value for slider based on the default parameter value
 * Uses tier-based scaling: if default*2 exceeds its tier boundary, expand the range
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

  // Use shared logic to calculate the range boundary, then make it negative
  return -calculateRangeBoundary(defaultValue);
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
          className="h-7 w-24 bg-background"
          onChange={(event) => {
            onChange(Number.parseFloat(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
