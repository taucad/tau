import { assign, setup, enqueueActions } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { LengthSymbol } from '@taucad/units';
import { convertLength } from '@taucad/units/converter';
import { parseLengthInput } from '@taucad/units/parser';
import { roundToSignificantFigures, formatUnitDisplay } from '#utils/number.utils.js';
import type { MeasurementDescriptor } from '#constants/build-parameters.js';
import { keydownListener } from '#machines/keydown.actor.js';
import { focusListener } from '#machines/focus.actor.js';
import { arrowKeyListener } from '#machines/arrow-key.actor.js';

/**
 * Slider calculation constants
 */
const defaultRangeForZero = 100;
const rangeTestMultiplier = 2;
const tierExpansionMultiplier = 2;
const minStepValue = 0.000_001;
const defaultStepForZero = 0.01;
const shiftStepMultiplier = 5; // Multiply step by 5x when Shift is held

/**
 * Calculate the tier boundary for a given value using log10.
 * The tier boundary is the power of 10 that defines the current tier.
 * For example: 60 → tier boundary is 10, 400 → tier boundary is 100
 */
function calculateTierBoundary(value: number): number {
  const absoluteValue = Math.abs(value);
  return 10 ** Math.floor(Math.log10(absoluteValue));
}

/**
 * Calculate the range boundary magnitude using tier-based scaling logic.
 * This shared logic determines whether to expand the range based on the 2x test.
 */
function calculateRangeBoundary(defaultValue: number): number {
  const absoluteValue = Math.abs(defaultValue);
  const tierBoundary = calculateTierBoundary(absoluteValue);
  const nextTier = tierBoundary * 10;

  // Test if doubled value exceeds the next tier boundary
  const testValue = absoluteValue * rangeTestMultiplier;

  // If test value meets or exceeds the next tier, expand the range
  if (testValue >= nextTier) {
    return nextTier * tierExpansionMultiplier;
  }

  return nextTier;
}

/**
 * Calculate appropriate step value for slider based on the default parameter value
 * Uses logarithmic scaling to determine the order of magnitude and set precision accordingly
 */
function calculateSliderStep(defaultValue: number): number {
  if (defaultValue === 0) {
    return defaultStepForZero;
  }

  const absoluteValue = Math.abs(defaultValue);

  // Calculate step using order of magnitude
  const orderOfMagnitude = Math.floor(Math.log10(absoluteValue));
  const step = 10 ** orderOfMagnitude;

  // Ensure step is never larger than 1 and never smaller than a reasonable minimum
  return Math.min(1, Math.max(step, minStepValue));
}

/**
 * Calculate appropriate minimum value for slider based on the default parameter value
 * Uses tier-based scaling: if default*2 exceeds its tier boundary, expand the range
 */
function calculateSliderMin(defaultValue: number): number {
  if (defaultValue === 0) {
    return -defaultRangeForZero;
  }

  // For positive values, always set minimum to 0
  if (defaultValue > 0) {
    return 0;
  }

  // Use shared logic to calculate the range boundary, then make it negative
  return -calculateRangeBoundary(defaultValue);
}

/**
 * Calculate appropriate maximum value for slider based on the default parameter value
 * Uses tier-based scaling: if default*2 exceeds its tier boundary, expand the range
 */
function calculateSliderMax(defaultValue: number): number {
  if (defaultValue === 0) {
    return defaultRangeForZero;
  }

  // For negative values, max should be 0
  if (defaultValue < 0) {
    return 0;
  }

  // Use shared logic to calculate the positive range boundary
  return calculateRangeBoundary(defaultValue);
}

/**
 * Parameter Machine Context
 * Manages state for a single parameter input with unit conversion support
 */
export type ParameterContext = {
  /** The committed value in baseline units (mm for length) */
  committedValue: number;
  /** The local value in display units (used during interaction) */
  localValue: number;
  /** Whether the input field is currently focused */
  isFocused: boolean;
  /** Whether user is actively dragging the slider */
  isDragging: boolean;
  /** The measurement descriptor (length, angle, count, unitless) */
  descriptor: MeasurementDescriptor;
  /** Whether to commit continually on every slider change (vs. only on release) */
  enableContinualOnChange: boolean;
  /** Current unit factor (cached for comparison) */
  currentUnitFactor: number;
  /** Current unit symbol (for parsing) */
  currentUnitSymbol: LengthSymbol;
  /** Display unit string (for UI display) */
  displayUnit: string;
  /** Default value in baseline units (for range calculations) */
  defaultValue: number;
  /** Optional minimum value in baseline units */
  min: number | undefined;
  /** Optional maximum value in baseline units */
  max: number | undefined;
  /** Optional original step value from input (in baseline units) */
  originalStep: number | undefined;
  /** Formatted value string (only when conversion occurred) */
  formattedValue: string | undefined;
  /** Whether the displayed value is an approximation */
  isApproximation: boolean;
  /** Calculated minimum value in display units */
  rangeMin: number;
  /** Calculated maximum value in display units */
  rangeMax: number;
  /** Base step in display units (without shift multiplier) */
  baseStep: number;
  /** Current step (baseStep with shift multiplier applied if shift is held) */
  step: number;
  /** Whether Shift key is currently held */
  isShiftHeld: boolean;
  /** Last emitted value (to prevent duplicate emissions) */
  lastEmittedValue: number | undefined;
  /** Ref to the input element for focus/arrow key listeners */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- ref can be null
  inputRef: React.RefObject<HTMLInputElement | null>;
};

/**
 * Parameter Machine Input
 */
export type ParameterInput = {
  /** Initial value in baseline units (mm for length) */
  initialValue: number;
  /** Default value in baseline units (for slider calculations) */
  defaultValue: number;
  /** Measurement descriptor */
  descriptor: MeasurementDescriptor;
  /** Whether to commit continually on every slider change (vs. only on release) */
  enableContinualOnChange: boolean;
  /** Initial unit factor */
  initialUnitFactor: number;
  /** Initial unit symbol */
  initialUnitSymbol: LengthSymbol;
  /** Ref to the input element for focus/arrow key listeners */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- ref can be null
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Optional minimum value in baseline units */
  min?: number;
  /** Optional maximum value in baseline units */
  max?: number;
  /** Optional step value in baseline units */
  step?: number;
};

/**
 * Calculate parameter range (min, max, step) based on default value and unit conversion
 */
function calculateParameterRange(parameters: {
  defaultValue: number;
  unitFactor: number;
  isLength: boolean;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
}): {
  rangeMin: number;
  rangeMax: number;
  baseStep: number;
} {
  const { defaultValue, unitFactor, isLength, min, max, step } = parameters;
  // Convert default value to display units
  const defaultValueInDisplayUnit = defaultValue / unitFactor;

  // Round to 4 sig fig if conversion occurred
  const hasConversion = isLength && unitFactor !== 1;
  const defaultValueForCalculations = hasConversion
    ? roundToSignificantFigures(defaultValueInDisplayUnit, 4)
    : defaultValueInDisplayUnit;

  // Calculate or convert step
  const baseStep = step === undefined ? calculateSliderStep(defaultValueForCalculations) : step / unitFactor;

  // Calculate or convert min/max
  const rangeMin = min === undefined ? calculateSliderMin(defaultValueForCalculations) : min / unitFactor;
  const rangeMax = max === undefined ? calculateSliderMax(defaultValueForCalculations) : max / unitFactor;

  return {
    rangeMin,
    rangeMax,
    baseStep,
  };
}

/**
 * Calculate formatted value and approximation status
 */
function calculateFormatting(
  committedValue: number,
  unitFactor: number,
  isLength: boolean,
  isInteracting: boolean,
): {
  formattedValue: string | undefined;
  isApproximation: boolean;
} {
  const hasConversion = isLength && unitFactor !== 1;

  if (!hasConversion || isInteracting) {
    return {
      formattedValue: undefined,
      isApproximation: false,
    };
  }

  const converted = committedValue / unitFactor;
  const formatted = formatUnitDisplay(converted, {
    significantFigures: 4,
    preserveTrailingZeros: false,
  });

  const displayedValue = Number.parseFloat(formatted);
  const isApproximation = Math.abs(converted - displayedValue) > 1e-10;

  return {
    formattedValue: formatted,
    isApproximation,
  };
}

/**
 * Parameter Machine Events
 */
type ParameterEventInternal =
  | { type: 'externalValueChanged'; value: number }
  | { type: 'sliderChanged'; value: number }
  | { type: 'sliderReleased'; value: number }
  | { type: 'inputChanged'; value: number }
  | { type: 'textInputChanged'; text: string }
  | { type: 'unitChanged'; unitFactor: number; unitSymbol: string }
  | {
      type: 'configChanged';
      defaultValue?: number;
      descriptor?: MeasurementDescriptor;
      min?: number;
      max?: number;
      step?: number;
      enableContinualOnChange?: boolean;
    }
  | { type: 'keyStateChanged'; key: string; isPressed: boolean }
  | { type: 'focusStateChanged'; isFocused: boolean }
  | { type: 'arrowKeyPressed'; direction: 'up' | 'down' };

/**
 * Parameter Machine Emitted Events
 */
export type ParameterEmitted = {
  type: 'valueCommit';
  value: number;
};

/**
 * Parameter State Machine
 * Manages parameter value state with unit conversion and interaction tracking
 */
export const parameterMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ParameterContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ParameterInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ParameterEventInternal,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ParameterEmitted,
  },
  actors: {
    keydownListener,
    focusListener,
    arrowKeyListener,
  },
  guards: {
    /**
     * Check if we should commit continually during slider drag.
     * Returns false by default to defer commits until slider release for better performance.
     * When enableContinualOnChange is true, commits happen on every slider movement.
     */
    shouldCommitContinually: ({ context }) => context.enableContinualOnChange,
    /**
     * Check if we should accept external value changes.
     * When actively editing (focused input or dragging slider), ignore external changes
     * to prevent feedback loops that cause value drift and incorrect arrow key behavior.
     */
    shouldAcceptExternalChange: ({ context }) => !context.isFocused && !context.isDragging,
  },
  actions: {
    updateExternalValue: assign(({ event, context }) => {
      if (event.type !== 'externalValueChanged') {
        return {};
      }

      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;
      const displayValue = event.value / unitFactor;

      // Apply rounding if conversion occurred
      const hasConversion = isLength && unitFactor !== 1;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      // Recalculate formatting (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting(event.value, unitFactor, isLength, isEditing);

      return {
        committedValue: event.value,
        localValue,
        ...formatting,
      };
    }),

    updateLocalValue: assign({
      localValue({ event }) {
        if (event.type !== 'sliderChanged' && event.type !== 'inputChanged') {
          return undefined as never;
        }

        return event.value;
      },
    }),

    commitValue: enqueueActions(({ enqueue, event, context }) => {
      if (event.type !== 'sliderChanged' && event.type !== 'sliderReleased' && event.type !== 'inputChanged') {
        return;
      }

      // Convert from display units to baseline units (mm for length)
      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;
      const baselineValue = event.value * unitFactor;

      // Check if this value is different from the last emitted value
      if (context.lastEmittedValue !== undefined && Math.abs(baselineValue - context.lastEmittedValue) < 1e-10) {
        // Value hasn't changed, don't emit (but still update local state for UI)
        const isEditing = context.isFocused || context.isDragging;
        const formatting = calculateFormatting(baselineValue, unitFactor, isLength, isEditing);
        enqueue.assign({
          committedValue: baselineValue,
          ...formatting,
        });
        return;
      }

      // Recalculate formatting with new committed value
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting(baselineValue, unitFactor, isLength, isEditing);

      enqueue.assign({
        committedValue: baselineValue,
        lastEmittedValue: baselineValue,
        ...formatting,
      });

      enqueue.emit({
        type: 'valueCommit' as const,
        value: baselineValue,
      });
    }),

    startDragging: assign({
      isDragging: true,
    }),

    stopDragging: assign({
      isDragging: false,
    }),

    handleUnitChange: assign(({ event, context }) => {
      if (event.type !== 'unitChanged') {
        return {};
      }

      // Only apply unit conversion for length measurements
      const isLength = context.descriptor === 'length';
      const newUnitFactor = isLength ? event.unitFactor : 1;
      const newUnit = isLength ? event.unitSymbol : 'mm';
      const displayUnit = isLength ? event.unitSymbol : '';
      const displayValue = context.committedValue / newUnitFactor;

      // Apply rounding if conversion occurred
      const hasConversion = isLength && newUnitFactor !== 1;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      // Recalculate range with new unit factor
      const range = calculateParameterRange({
        defaultValue: context.defaultValue,
        unitFactor: newUnitFactor,
        isLength,
        min: context.min,
        max: context.max,
        step: context.originalStep,
      });

      // Recalculate formatting with new unit factor (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting(context.committedValue, newUnitFactor, isLength, isEditing);

      return {
        localValue,
        currentUnitFactor: newUnitFactor,
        currentUnitSymbol: newUnit,
        displayUnit,
        ...range,
        ...formatting,
      };
    }),

    handleConfigChange: assign(({ event, context }) => {
      if (event.type !== 'configChanged') {
        return {};
      }

      // Update context values with new config
      // For required properties (defaultValue, descriptor, enableContinualOnChange), use ?? since they should never be undefined
      // For optional constraints (min, max, step), use 'in' operator to distinguish between:
      //   - undefined (clear constraint) vs absent (keep old value)
      const newDefaultValue = event.defaultValue ?? context.defaultValue;
      const newDescriptor = event.descriptor ?? context.descriptor;
      const newMin = 'min' in event ? event.min : context.min;
      const newMax = 'max' in event ? event.max : context.max;
      const newStep = 'step' in event ? event.step : context.originalStep;
      const newEnableContinualOnChange = event.enableContinualOnChange ?? context.enableContinualOnChange;

      // Check if descriptor changed - if so, we may need to update unit handling
      const isLength = newDescriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;
      const unitSymbol = isLength ? context.currentUnitSymbol : 'mm';
      const displayUnit = isLength ? context.currentUnitSymbol : '';

      // Recalculate display value based on new descriptor
      const displayValue = context.committedValue / unitFactor;
      const hasConversion = isLength && unitFactor !== 1;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      // Recalculate range with new config values
      const range = calculateParameterRange({
        defaultValue: newDefaultValue,
        unitFactor,
        isLength,
        min: newMin,
        max: newMax,
        step: newStep,
      });

      // Recalculate formatting (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting(context.committedValue, unitFactor, isLength, isEditing);

      return {
        defaultValue: newDefaultValue,
        descriptor: newDescriptor,
        min: newMin,
        max: newMax,
        originalStep: newStep,
        enableContinualOnChange: newEnableContinualOnChange,
        currentUnitFactor: unitFactor,
        currentUnitSymbol: unitSymbol,
        displayUnit,
        localValue,
        ...range,
        ...formatting,
      };
    }),

    handleShiftKeyChange: assign(({ event, context }) => {
      if (event.type !== 'keyStateChanged' || event.key !== 'Shift') {
        return {};
      }

      // Apply shift multiplier to step when shift is held
      const step = event.isPressed ? context.baseStep * shiftStepMultiplier : context.baseStep;

      return {
        isShiftHeld: event.isPressed,
        step,
      };
    }),

    handleFocusChange: assign(({ event }) => {
      if (event.type !== 'focusStateChanged') {
        return {};
      }

      return {
        isFocused: event.isFocused,
      };
    }),

    handleArrowKey: enqueueActions(({ enqueue, event, context }) => {
      if (event.type !== 'arrowKeyPressed') {
        return;
      }

      const { direction } = event;

      // Use current step (already accounts for shift multiplier)
      const delta = direction === 'up' ? context.step : -context.step;
      const rawValue = context.localValue + delta;

      // Round to step precision to avoid floating-point errors
      const decimalPlaces = Math.max(0, -Math.floor(Math.log10(context.baseStep)));
      const roundedValue = Number(rawValue.toFixed(decimalPlaces));

      // Clamp to range min/max
      const clampedValue = Math.max(context.rangeMin, Math.min(context.rangeMax, roundedValue));

      // Convert to baseline units
      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;
      const baselineValue = clampedValue * unitFactor;

      // Check if this value is different from the last emitted value
      if (context.lastEmittedValue !== undefined && Math.abs(baselineValue - context.lastEmittedValue) < 1e-10) {
        // Value hasn't changed, don't emit (but still update local state for UI)
        // Use editing mode for formatting to preserve precision during arrow key interaction
        const formatting = calculateFormatting(baselineValue, unitFactor, isLength, true);
        enqueue.assign({
          localValue: clampedValue,
          committedValue: baselineValue,
          ...formatting,
        });
        return;
      }

      // Recalculate formatting with new committed value
      // Use editing mode for formatting to preserve precision during arrow key interaction
      const formatting = calculateFormatting(baselineValue, unitFactor, isLength, true);

      enqueue.assign({
        localValue: clampedValue,
        committedValue: baselineValue,
        lastEmittedValue: baselineValue,
        ...formatting,
      });

      enqueue.emit({
        type: 'valueCommit' as const,
        value: baselineValue,
      });
    }),

    parseAndCommitText: enqueueActions(({ enqueue, event, context }) => {
      if (event.type !== 'textInputChanged') {
        return;
      }

      const { text } = event;

      if (text === '') {
        return; // Do not process empty values
      }

      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;
      let valueInDisplayUnit: number | undefined;

      // For length parameters, try to parse with units and fractions
      if (isLength) {
        const parsed = parseLengthInput(text);
        if (parsed) {
          // If a unit was specified and differs from current unit, convert
          // eslint-disable-next-line unicorn/prefer-ternary -- ternary is not as readable as if/else
          if (parsed.symbol && parsed.symbol !== context.currentUnitSymbol) {
            // Convert from parsed unit to current display unit
            valueInDisplayUnit = convertLength(parsed.value, parsed.symbol, context.currentUnitSymbol);
          } else {
            valueInDisplayUnit = parsed.value;
          }
        }
      } else {
        // Fallback to simple number parsing for non-length
        const parsed = Number(text);
        if (Number.isFinite(parsed)) {
          valueInDisplayUnit = parsed;
        }
      }

      // If parsing failed, do nothing
      if (valueInDisplayUnit === undefined) {
        return;
      }

      // Convert to baseline units (mm for length)
      const baselineValue = valueInDisplayUnit * unitFactor;

      // Check if this value is different from the last emitted value
      if (context.lastEmittedValue !== undefined && Math.abs(baselineValue - context.lastEmittedValue) < 1e-10) {
        // Value hasn't changed, don't emit
        return;
      }

      // Apply rounding if conversion occurred
      const hasConversion = isLength && unitFactor !== 1;
      const localValue = hasConversion ? roundToSignificantFigures(valueInDisplayUnit, 4) : valueInDisplayUnit;

      // Recalculate formatting with new committed value (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting(baselineValue, unitFactor, isLength, isEditing);

      enqueue.assign({
        committedValue: baselineValue,
        localValue,
        lastEmittedValue: baselineValue,
        ...formatting,
      });

      enqueue.emit({
        type: 'valueCommit' as const,
        value: baselineValue,
      });
    }),
  },
}).createMachine({
  id: 'parameter',
  context({ input }) {
    // Only apply unit conversion for length measurements
    const isLength = input.descriptor === 'length';
    const unitFactor = isLength ? input.initialUnitFactor : 1;
    const unitSymbol = isLength ? input.initialUnitSymbol : 'mm';
    const displayUnit = isLength ? input.initialUnitSymbol : '';
    const displayValue = input.initialValue / unitFactor;
    const hasConversion = isLength && unitFactor !== 1;
    const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

    // Calculate parameter range (min, max, step)
    const range = calculateParameterRange({
      defaultValue: input.defaultValue,
      unitFactor,
      isLength,
      min: input.min,
      max: input.max,
      step: input.step,
    });

    // Calculate formatting
    const formatting = calculateFormatting(input.initialValue, unitFactor, isLength, false);

    return {
      committedValue: input.initialValue,
      localValue,
      isFocused: false,
      isDragging: false,
      descriptor: input.descriptor,
      enableContinualOnChange: input.enableContinualOnChange,
      currentUnitFactor: unitFactor,
      currentUnitSymbol: unitSymbol,
      displayUnit,
      defaultValue: input.defaultValue,
      min: input.min,
      max: input.max,
      originalStep: input.step,
      ...range,
      ...formatting,
      step: range.baseStep, // Initialize with baseStep (no shift multiplier)
      isShiftHeld: false,
      lastEmittedValue: undefined,
      inputRef: input.inputRef,
    };
  },
  initial: 'idle',
  invoke: [
    {
      id: 'keydownListener',
      src: 'keydownListener',
      input: () => ({
        key: 'Shift',
      }),
    },
    {
      id: 'focusListener',
      src: 'focusListener',
      input: ({ context }) => ({
        elementRef: context.inputRef,
      }),
    },
    {
      id: 'arrowKeyListener',
      src: 'arrowKeyListener',
      input: ({ context }) => ({
        elementRef: context.inputRef,
      }),
    },
  ],
  states: {
    idle: {
      on: {
        externalValueChanged: {
          guard: 'shouldAcceptExternalChange',
          actions: 'updateExternalValue',
        },
        unitChanged: {
          actions: 'handleUnitChange',
        },
        configChanged: {
          actions: 'handleConfigChange',
        },
        keyStateChanged: {
          actions: 'handleShiftKeyChange',
        },
        focusStateChanged: {
          actions: 'handleFocusChange',
        },
        arrowKeyPressed: {
          actions: 'handleArrowKey',
        },
        sliderChanged: [
          {
            guard: 'shouldCommitContinually',
            actions: ['startDragging', 'updateLocalValue', 'commitValue'],
          },
          {
            actions: ['startDragging', 'updateLocalValue'],
          },
        ],
        sliderReleased: {
          actions: ['stopDragging', 'commitValue'],
        },
        inputChanged: {
          actions: ['updateLocalValue', 'commitValue'],
        },
        textInputChanged: {
          actions: 'parseAndCommitText',
        },
      },
    },
  },
});

export type ParameterMachineActor = ActorRefFrom<typeof parameterMachine>;
