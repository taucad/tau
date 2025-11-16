import * as React from 'react';
import { Slider } from '#components/ui/slider.js';
import { ChatParametersInputNumber } from '#routes/builds_.$id/chat-parameters-input-number.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { MeasurementDescriptor } from '#constants/build-parameters.js';

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

/*
 * The target percentage of the default value that the shift multiplier should represent.
 * This helps select an appropriate multiplier from the sequence.
 */
const TargetShiftPercentage = 0.1; // 10% of the value

/**
 * Calculate the shift step multiplier based on the magnitude of the default value.
 * Returns a value from the sequence: [..., 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000, ...]
 * The multiplier scales with the default value to provide consistent UX across different magnitudes.
 *
 * @param defaultValue - The default value of the parameter
 * @returns The calculated shift step multiplier from the 5/10 sequence
 */
const calculateShiftStepMultiplier = (defaultValue: number): number => {
  if (defaultValue === 0) {
    return 5;
  }

  const absoluteValue = Math.abs(defaultValue);

  // Calculate the target multiplier as a percentage of the value
  const targetMultiplier = absoluteValue * TargetShiftPercentage;

  // Find the magnitude (power of 10) we're working with
  const magnitude = Math.floor(Math.log10(targetMultiplier));

  // Generate two candidate multipliers: 10^n and 5 * 10^n
  const lowerCandidate = 10 ** magnitude;
  const upperCandidate = 5 * 10 ** magnitude;

  // Pick the one closest to our target
  const lowerDiff = Math.abs(targetMultiplier - lowerCandidate);
  const upperDiff = Math.abs(targetMultiplier - upperCandidate);

  return lowerDiff < upperDiff ? lowerCandidate : upperCandidate;
};

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
  readonly descriptor: MeasurementDescriptor;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  // eslint-disable-next-line react/boolean-prop-naming -- following input boolean prop naming convention.
  readonly disabled?: boolean;
} & Omit<React.ComponentProps<typeof ChatParametersInputNumber>, 'value' | 'onValueChange' | 'defaultValue'>;

export function ChatParametersNumber({
  value,
  defaultValue,
  onChange,
  descriptor,
  min,
  max,
  step,
  disabled,
  ...properties
}: ChatParametersNumberProps): React.JSX.Element {
  // Local state to track slider value during dragging for visual feedback
  const [localValue, setLocalValue] = React.useState<number>(value);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);

  // Sync local state when external value changes, but avoid clobbering while dragging
  React.useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  // Track Shift key state for adjusting slider step
  const { isKeyPressed: isShiftHeld } = useKeydown(
    { key: 'Shift' },
    () => {
      // No-op callback, we just use the returned isKeyPressed state
    },
    {
      preventDefault: false,
      stopPropagation: false,
    },
  );

  const baseStep = step ?? calculateSliderStep(defaultValue);
  const shiftMultiplier = calculateShiftStepMultiplier(defaultValue);
  const effectiveStep = isShiftHeld ? baseStep * shiftMultiplier : baseStep;

  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Slider
        variant="inset"
        value={[localValue]}
        min={min ?? calculateSliderMin(defaultValue)}
        max={max ?? calculateSliderMax(defaultValue)}
        step={effectiveStep}
        disabled={disabled}
        className="[&_[data-slot=slider-track]]:h-7 md:[&_[data-slot=slider-track]]:h-4.5"
        onValueChange={([newValue]) => {
          // Update local state for visual feedback during dragging
          setLocalValue(Number(newValue));
          setIsDragging(true);
        }}
        onValueCommit={([newValue]) => {
          // Fire onChange callback only when user releases the mouse (mouseup)
          setIsDragging(false);
          onChange(Number(newValue));
        }}
      />
      <ChatParametersInputNumber
        value={localValue}
        descriptor={descriptor}
        className="h-7 w-24 bg-background"
        disabled={disabled}
        onValueChange={onChange}
        {...properties}
      />
    </div>
  );
}
