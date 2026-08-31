import { assign, setup, enqueueActions } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { LengthSymbol } from '@taucad/units';
import { convertLength } from '@taucad/units/converter';
import { parseLengthInput } from '@taucad/units/parser';
import { roundToSignificantFigures, formatUnitDisplay } from '#utils/number.utils.js';
import type { MeasurementDescriptor } from '#constants/project-parameters.js';
import { keydownListener } from '#machines/keydown.actor.js';

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
  /** The committed value in the CAD parameter's declared source unit. */
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
  /** CAD parameter source symbol. */
  currentSourceSymbol: LengthSymbol;
  /** Human-selected display symbol. */
  currentDisplaySymbol: LengthSymbol;
  /** Display unit string (for UI display) */
  displayUnit: string;
  /** Default value in the CAD parameter's source unit. */
  defaultValue: number;
  /** Optional minimum value in the source unit. */
  min: number | undefined;
  /** Optional maximum value in the source unit. */
  max: number | undefined;
  /** Optional original step value from input in the source unit. */
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
};

/**
 * Parameter Machine Input
 */
export type ParameterInput = {
  /** Initial value in the CAD parameter's source unit. */
  initialValue: number;
  /** Default value in the CAD parameter's source unit. */
  defaultValue: number;
  /** Measurement descriptor */
  descriptor: MeasurementDescriptor;
  /** Whether to commit continually on every slider change (vs. only on release) */
  enableContinualOnChange: boolean;
  /** CAD parameter source symbol. */
  initialSourceSymbol: LengthSymbol;
  /** Initial human-selected display symbol. */
  initialDisplaySymbol: LengthSymbol;
  /** Optional minimum value in the source unit. */
  min?: number;
  /** Optional maximum value in the source unit. */
  max?: number;
  /** Optional step value in the source unit. */
  step?: number;
};

/**
 * Calculate parameter range (min, max, step) based on default value and unit conversion
 */
function calculateParameterRange(parameters: {
  defaultValue: number;
  sourceSymbol: LengthSymbol;
  displaySymbol: LengthSymbol;
  isLength: boolean;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
}): {
  rangeMin: number;
  rangeMax: number;
  baseStep: number;
} {
  const { defaultValue, sourceSymbol, displaySymbol, isLength, min, max, step } = parameters;
  const toDisplay = (value: number): number => (isLength ? convertLength(value, sourceSymbol, displaySymbol) : value);
  const defaultValueInDisplayUnit = toDisplay(defaultValue);

  // Round to 4 sig fig if conversion occurred
  const hasConversion = isLength && sourceSymbol !== displaySymbol;
  const defaultValueForCalculations = hasConversion
    ? roundToSignificantFigures(defaultValueInDisplayUnit, 4)
    : defaultValueInDisplayUnit;

  // Calculate or convert step
  const baseStep = step === undefined ? calculateSliderStep(defaultValueForCalculations) : toDisplay(step);

  // Calculate or convert min/max
  const rangeMin = min === undefined ? calculateSliderMin(defaultValueForCalculations) : toDisplay(min);
  const rangeMax = max === undefined ? calculateSliderMax(defaultValueForCalculations) : toDisplay(max);

  return {
    rangeMin,
    rangeMax,
    baseStep,
  };
}

/**
 * Calculate formatted value and approximation status
 */
function calculateFormatting({
  committedValue,
  sourceSymbol,
  displaySymbol,
  isLength,
  isInteracting,
}: {
  committedValue: number;
  sourceSymbol: LengthSymbol;
  displaySymbol: LengthSymbol;
  isLength: boolean;
  isInteracting: boolean;
}): {
  formattedValue: string | undefined;
  isApproximation: boolean;
} {
  const hasConversion = isLength && sourceSymbol !== displaySymbol;

  if (!hasConversion || isInteracting) {
    return {
      formattedValue: undefined,
      isApproximation: false,
    };
  }

  const converted = convertLength(committedValue, sourceSymbol, displaySymbol);
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
  | { type: 'unitChanged'; sourceSymbol: LengthSymbol; displaySymbol: LengthSymbol }
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
  | { type: 'focusStateChanged'; isFocused: boolean };

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
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ParameterContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ParameterInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ParameterEventInternal,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ParameterEmitted,
  },
  actors: {
    keydownListener,
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
      const displayValue = isLength
        ? convertLength(event.value, context.currentSourceSymbol, context.currentDisplaySymbol)
        : event.value;

      // Apply rounding if conversion occurred
      const hasConversion = isLength && context.currentSourceSymbol !== context.currentDisplaySymbol;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      // Recalculate formatting (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting({
        committedValue: event.value,
        sourceSymbol: context.currentSourceSymbol,
        displaySymbol: context.currentDisplaySymbol,
        isLength,
        isInteracting: isEditing,
      });

      return {
        committedValue: event.value,
        localValue,
        ...formatting,
      };
    }),

    updateLocalValue: assign({
      localValue({ context, event }) {
        if (event.type !== 'sliderChanged' && event.type !== 'inputChanged') {
          return context.localValue;
        }

        return event.value;
      },
    }),

    commitValue: enqueueActions(({ enqueue, event, context }) => {
      if (event.type !== 'sliderChanged' && event.type !== 'sliderReleased' && event.type !== 'inputChanged') {
        return;
      }

      const isLength = context.descriptor === 'length';
      const sourceValue = isLength
        ? convertLength(event.value, context.currentDisplaySymbol, context.currentSourceSymbol)
        : event.value;

      // Check if this value is different from the last emitted value
      if (context.lastEmittedValue !== undefined && Math.abs(sourceValue - context.lastEmittedValue) < 1e-10) {
        // Value hasn't changed, don't emit (but still update local state for UI)
        const isEditing = context.isFocused || context.isDragging;
        const formatting = calculateFormatting({
          committedValue: sourceValue,
          sourceSymbol: context.currentSourceSymbol,
          displaySymbol: context.currentDisplaySymbol,
          isLength,
          isInteracting: isEditing,
        });
        enqueue.assign({
          committedValue: sourceValue,
          ...formatting,
        });
        return;
      }

      // Recalculate formatting with new committed value
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting({
        committedValue: sourceValue,
        sourceSymbol: context.currentSourceSymbol,
        displaySymbol: context.currentDisplaySymbol,
        isLength,
        isInteracting: isEditing,
      });

      enqueue.assign({
        committedValue: sourceValue,
        lastEmittedValue: sourceValue,
        ...formatting,
      });

      enqueue.emit({
        type: 'valueCommit',
        value: sourceValue,
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

      const isLength = context.descriptor === 'length';
      const sourceSymbol = isLength ? event.sourceSymbol : context.currentSourceSymbol;
      const displaySymbol = isLength ? event.displaySymbol : context.currentDisplaySymbol;
      const displayUnit = isLength ? displaySymbol : '';
      const displayValue = isLength
        ? convertLength(context.committedValue, sourceSymbol, displaySymbol)
        : context.committedValue;

      // Apply rounding if conversion occurred
      const hasConversion = isLength && sourceSymbol !== displaySymbol;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      const range = calculateParameterRange({
        defaultValue: context.defaultValue,
        sourceSymbol,
        displaySymbol,
        isLength,
        min: context.min,
        max: context.max,
        step: context.originalStep,
      });

      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting({
        committedValue: context.committedValue,
        sourceSymbol,
        displaySymbol,
        isLength,
        isInteracting: isEditing,
      });

      return {
        localValue,
        currentSourceSymbol: sourceSymbol,
        currentDisplaySymbol: displaySymbol,
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
      const sourceSymbol = context.currentSourceSymbol;
      const displaySymbol = context.currentDisplaySymbol;
      const displayUnit = isLength ? displaySymbol : '';

      // Recalculate display value based on new descriptor
      const displayValue = isLength
        ? convertLength(context.committedValue, sourceSymbol, displaySymbol)
        : context.committedValue;
      const hasConversion = isLength && sourceSymbol !== displaySymbol;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      // Recalculate range with new config values
      const range = calculateParameterRange({
        defaultValue: newDefaultValue,
        sourceSymbol,
        displaySymbol,
        isLength,
        min: newMin,
        max: newMax,
        step: newStep,
      });

      // Recalculate formatting (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting({
        committedValue: context.committedValue,
        sourceSymbol,
        displaySymbol,
        isLength,
        isInteracting: isEditing,
      });

      return {
        defaultValue: newDefaultValue,
        descriptor: newDescriptor,
        min: newMin,
        max: newMax,
        originalStep: newStep,
        enableContinualOnChange: newEnableContinualOnChange,
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

    parseAndCommitText: enqueueActions(({ enqueue, event, context }) => {
      if (event.type !== 'textInputChanged') {
        return;
      }

      const { text } = event;

      if (text === '') {
        return; // Do not process empty values
      }

      const isLength = context.descriptor === 'length';
      let valueInDisplayUnit: number | undefined;

      // For length parameters, try to parse with units and fractions
      if (isLength) {
        const parsed = parseLengthInput(text);
        if (parsed) {
          // If a unit was specified and differs from current unit, convert
          // oxlint-disable-next-line unicorn/prefer-ternary -- ternary is not as readable as if/else
          if (parsed.symbol && parsed.symbol !== context.currentDisplaySymbol) {
            // Convert from parsed unit to current display unit
            valueInDisplayUnit = convertLength(parsed.value, parsed.symbol, context.currentDisplaySymbol);
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

      const sourceValue = isLength
        ? convertLength(valueInDisplayUnit, context.currentDisplaySymbol, context.currentSourceSymbol)
        : valueInDisplayUnit;

      // Check if this value is different from the last emitted value
      if (context.lastEmittedValue !== undefined && Math.abs(sourceValue - context.lastEmittedValue) < 1e-10) {
        // Value hasn't changed, don't emit
        return;
      }

      // Apply rounding if conversion occurred
      const hasConversion = isLength && context.currentSourceSymbol !== context.currentDisplaySymbol;
      const localValue = hasConversion ? roundToSignificantFigures(valueInDisplayUnit, 4) : valueInDisplayUnit;

      // Recalculate formatting with new committed value (preserve precision if actively editing)
      const isEditing = context.isFocused || context.isDragging;
      const formatting = calculateFormatting({
        committedValue: sourceValue,
        sourceSymbol: context.currentSourceSymbol,
        displaySymbol: context.currentDisplaySymbol,
        isLength,
        isInteracting: isEditing,
      });

      enqueue.assign({
        committedValue: sourceValue,
        localValue,
        lastEmittedValue: sourceValue,
        ...formatting,
      });

      enqueue.emit({
        type: 'valueCommit',
        value: sourceValue,
      });
    }),
  },
}).createMachine({
  id: 'parameter',
  context({ input }) {
    const isLength = input.descriptor === 'length';
    const sourceSymbol = input.initialSourceSymbol;
    const displaySymbol = input.initialDisplaySymbol;
    const displayUnit = isLength ? displaySymbol : '';
    const displayValue = isLength ? convertLength(input.initialValue, sourceSymbol, displaySymbol) : input.initialValue;
    const hasConversion = isLength && sourceSymbol !== displaySymbol;
    const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

    // Calculate parameter range (min, max, step)
    const range = calculateParameterRange({
      defaultValue: input.defaultValue,
      sourceSymbol,
      displaySymbol,
      isLength,
      min: input.min,
      max: input.max,
      step: input.step,
    });

    // Calculate formatting
    const formatting = calculateFormatting({
      committedValue: input.initialValue,
      sourceSymbol,
      displaySymbol,
      isLength,
      isInteracting: false,
    });

    return {
      committedValue: input.initialValue,
      localValue,
      isFocused: false,
      isDragging: false,
      descriptor: input.descriptor,
      enableContinualOnChange: input.enableContinualOnChange,
      currentSourceSymbol: sourceSymbol,
      currentDisplaySymbol: displaySymbol,
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
