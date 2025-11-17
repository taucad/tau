import { assign, setup, enqueueActions, fromCallback } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { MeasurementDescriptor } from '#constants/build-parameters.js';
import type { LengthUnit } from '#utils/unit.utils.js';
import { roundToSignificantFigures, formatLengthDisplay, parseLengthInput, lengthUnitToMm } from '#utils/unit.utils.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
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
 * Get the shift step multiplier (constant 5x for all values)
 */
function getShiftStepMultiplier(): number {
  return shiftStepMultiplier;
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
  /** Whether user is actively interacting with the slider */
  isInteracting: boolean;
  /** Whether the input field is currently focused */
  isFocused: boolean;
  /** The measurement descriptor (length, angle, count, unitless) */
  descriptor: MeasurementDescriptor;
  /** Whether to commit on every change or defer until release */
  enableCommitOnChange: boolean;
  /** Reference to graphics machine for unit conversion */
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  /** Current unit factor (cached for comparison) */
  currentUnitFactor: number;
  /** Current unit string (for parsing) */
  currentUnit: string;
  /** Default value in baseline units (for slider calculations) */
  defaultValue: number;
  /** Optional minimum value in baseline units */
  min: number | undefined;
  /** Optional maximum value in baseline units */
  max: number | undefined;
  /** Optional step value in baseline units */
  step: number | undefined;
  /** Formatted value string (only when conversion occurred) */
  formattedValue: string | undefined;
  /** Whether the displayed value is an approximation */
  isApproximation: boolean;
  /** Calculated slider minimum in display units */
  sliderMin: number;
  /** Calculated slider maximum in display units */
  sliderMax: number;
  /** Calculated slider step in display units */
  sliderStep: number;
  /** Shift step multiplier for finer control */
  shiftMultiplier: number;
  /** Whether the Shift key is currently held */
  isShiftHeld: boolean;
  /** Effective step (base step or with shift multiplier applied) */
  effectiveStep: number;
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
  /** Whether to commit on every change */
  enableCommitOnChange: boolean;
  /** Graphics machine reference for unit conversion */
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  /** Initial unit factor (from graphics machine context) */
  initialUnitFactor: number;
  /** Initial unit string (from graphics machine context) */
  initialUnit: string;
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
 * Calculate all slider properties based on default value and unit conversion
 */
function calculateSliderProperties(parameters: {
  defaultValue: number;
  unitFactor: number;
  isLength: boolean;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
}): {
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  shiftMultiplier: number;
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

  // Get shift multiplier (constant 5x)
  const shiftMultiplier = getShiftStepMultiplier();

  // Calculate or convert min/max
  const sliderMin = min === undefined ? calculateSliderMin(defaultValueForCalculations) : min / unitFactor;
  const sliderMax = max === undefined ? calculateSliderMax(defaultValueForCalculations) : max / unitFactor;

  return {
    sliderMin,
    sliderMax,
    sliderStep: baseStep,
    shiftMultiplier,
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
  const formatted = formatLengthDisplay(converted, {
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
 * Calculate effective step based on shift key state
 */
function calculateEffectiveStep(baseStep: number, shiftMultiplier: number, isShiftHeld: boolean): number {
  return isShiftHeld ? baseStep * shiftMultiplier : baseStep;
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
  | { type: 'unitChanged'; unitFactor: number; unit: string }
  | { type: 'keyStateChanged'; key: string; isPressed: boolean }
  | { type: 'focusStateChanged'; isFocused: boolean }
  | { type: 'arrowKeyPressed'; direction: 'up' | 'down'; isShiftHeld: boolean };

/**
 * Parameter Machine Emitted Events
 */
export type ParameterEmitted = {
  type: 'valueCommit';
  value: number;
};

/**
 * Graphics Unit Listener Actor
 * Listens to graphics machine unitChanged events and sends back to parent machine
 */
const graphicsUnitListener = fromCallback<
  { type: 'unitChanged'; unitFactor: number; unit: string },
  {
    graphicsRef: ActorRefFrom<typeof graphicsMachine>;
    descriptor: MeasurementDescriptor;
  }
>(({ sendBack, input }) => {
  const { descriptor, graphicsRef } = input;

  // Only track units for length measurements
  if (descriptor !== 'length') {
    return () => {
      // No-op cleanup for non-length descriptors
    };
  }

  // Listen to unitChanged events from graphics machine
  const subscription = graphicsRef.on('unitChanged', (event) => {
    // Forward the event to parent machine with factor and unit string
    sendBack({ type: 'unitChanged', unitFactor: event.factor, unit: event.unit });
  });

  // Cleanup function - unsubscribe when actor stops
  return () => {
    subscription.unsubscribe();
  };
});

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
    graphicsUnitListener,
    keydownListener,
    focusListener,
    arrowKeyListener,
  },
  guards: {
    shouldCommitOnChange: ({ context }) => !context.enableCommitOnChange,
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

      // Recalculate formatting
      const formatting = calculateFormatting(event.value, unitFactor, isLength, context.isInteracting);

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
        const formatting = calculateFormatting(baselineValue, unitFactor, isLength, context.isInteracting);
        enqueue.assign({
          committedValue: baselineValue,
          ...formatting,
        });
        return;
      }

      // Recalculate formatting with new committed value
      const formatting = calculateFormatting(baselineValue, unitFactor, isLength, context.isInteracting);

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

    startInteraction: assign(({ context }) => {
      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;

      // Clear formatting while interacting
      const formatting = calculateFormatting(context.committedValue, unitFactor, isLength, true);

      return {
        isInteracting: true,
        ...formatting,
      };
    }),

    endInteraction: assign(({ context }) => {
      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;

      // Restore formatting after interaction
      const formatting = calculateFormatting(context.committedValue, unitFactor, isLength, false);

      return {
        isInteracting: false,
        ...formatting,
      };
    }),

    handleUnitChange: assign(({ event, context }) => {
      if (event.type !== 'unitChanged') {
        return {};
      }

      // Convert committed value to new display units
      const isLength = context.descriptor === 'length';
      const newUnitFactor = event.unitFactor;
      const newUnit = event.unit;
      const displayValue = context.committedValue / newUnitFactor;

      // Apply rounding if conversion occurred
      const hasConversion = isLength && newUnitFactor !== 1;
      const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

      // Recalculate slider properties with new unit factor
      const sliderProperties = calculateSliderProperties({
        defaultValue: context.defaultValue,
        unitFactor: newUnitFactor,
        isLength,
        min: context.min,
        max: context.max,
        step: context.step,
      });

      // Recalculate formatting with new unit factor
      const formatting = calculateFormatting(context.committedValue, newUnitFactor, isLength, context.isInteracting);

      // Recalculate effective step with new slider step
      const effectiveStep = calculateEffectiveStep(
        sliderProperties.sliderStep,
        sliderProperties.shiftMultiplier,
        context.isShiftHeld,
      );

      return {
        localValue,
        currentUnitFactor: newUnitFactor,
        currentUnit: newUnit,
        ...sliderProperties,
        ...formatting,
        effectiveStep,
      };
    }),

    handleShiftKeyChange: assign(({ event, context }) => {
      if (event.type !== 'keyStateChanged' || event.key !== 'Shift') {
        return {};
      }

      const effectiveStep = calculateEffectiveStep(context.sliderStep, context.shiftMultiplier, event.isPressed);

      return {
        isShiftHeld: event.isPressed,
        effectiveStep,
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

      const { direction, isShiftHeld } = event;

      // Calculate step size (use shift multiplier if shift is held)
      const stepSize = isShiftHeld ? context.sliderStep * context.shiftMultiplier : context.sliderStep;

      // Calculate new value
      const delta = direction === 'up' ? stepSize : -stepSize;
      const newValue = context.localValue + delta;

      // Clamp to slider min/max
      const clampedValue = Math.max(context.sliderMin, Math.min(context.sliderMax, newValue));

      // Convert to baseline units
      const isLength = context.descriptor === 'length';
      const unitFactor = isLength ? context.currentUnitFactor : 1;
      const baselineValue = clampedValue * unitFactor;

      // Check if this value is different from the last emitted value
      if (context.lastEmittedValue !== undefined && Math.abs(baselineValue - context.lastEmittedValue) < 1e-10) {
        // Value hasn't changed, don't emit (but still update local state for UI)
        const formatting = calculateFormatting(baselineValue, unitFactor, isLength, context.isInteracting);
        enqueue.assign({
          localValue: clampedValue,
          committedValue: baselineValue,
          ...formatting,
        });
        return;
      }

      // Recalculate formatting with new committed value
      const formatting = calculateFormatting(baselineValue, unitFactor, isLength, context.isInteracting);

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
          if (parsed.unit && parsed.unit !== context.currentUnit) {
            // Convert from parsed unit to mm, then to display unit
            const sourceFactor = lengthUnitToMm[parsed.unit as LengthUnit] || unitFactor;
            const targetFactor = lengthUnitToMm[context.currentUnit as LengthUnit] || unitFactor;
            const valueInMm = parsed.value * sourceFactor;
            valueInDisplayUnit = valueInMm / targetFactor;
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

      // Recalculate formatting with new committed value
      const formatting = calculateFormatting(baselineValue, unitFactor, isLength, context.isInteracting);

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
    const isLength = input.descriptor === 'length';
    const unitFactor = isLength ? input.initialUnitFactor : 1;
    const unit = isLength ? input.initialUnit : 'mm';
    const displayValue = input.initialValue / unitFactor;
    const hasConversion = isLength && unitFactor !== 1;
    const localValue = hasConversion ? roundToSignificantFigures(displayValue, 4) : displayValue;

    // Calculate slider properties
    const sliderProperties = calculateSliderProperties({
      defaultValue: input.defaultValue,
      unitFactor,
      isLength,
      min: input.min,
      max: input.max,
      step: input.step,
    });

    // Calculate formatting
    const formatting = calculateFormatting(input.initialValue, unitFactor, isLength, false);

    // Calculate initial effective step (shift not held initially)
    const effectiveStep = calculateEffectiveStep(sliderProperties.sliderStep, sliderProperties.shiftMultiplier, false);

    return {
      committedValue: input.initialValue,
      localValue,
      isInteracting: false,
      isFocused: false,
      descriptor: input.descriptor,
      enableCommitOnChange: input.enableCommitOnChange,
      graphicsRef: input.graphicsRef,
      currentUnitFactor: unitFactor,
      currentUnit: unit,
      defaultValue: input.defaultValue,
      min: input.min,
      max: input.max,
      step: input.step,
      ...sliderProperties,
      ...formatting,
      isShiftHeld: false,
      effectiveStep,
      lastEmittedValue: undefined,
      inputRef: input.inputRef,
    };
  },
  initial: 'idle',
  invoke: [
    {
      id: 'graphicsUnitListener',
      src: 'graphicsUnitListener',
      input: ({ context }) => ({
        graphicsRef: context.graphicsRef,
        descriptor: context.descriptor,
      }),
    },
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
          actions: 'updateExternalValue',
        },
        unitChanged: {
          actions: 'handleUnitChange',
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
            guard: 'shouldCommitOnChange',
            target: 'interacting',
            actions: ['updateLocalValue', 'commitValue'],
          },
          {
            target: 'interacting',
            actions: 'updateLocalValue',
          },
        ],
        inputChanged: {
          actions: ['updateLocalValue', 'commitValue'],
        },
        textInputChanged: {
          actions: 'parseAndCommitText',
        },
      },
    },
    interacting: {
      entry: 'startInteraction',
      on: {
        externalValueChanged: {
          actions: 'updateExternalValue',
        },
        unitChanged: {
          actions: 'handleUnitChange',
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
            guard: 'shouldCommitOnChange',
            actions: ['updateLocalValue', 'commitValue'],
          },
          {
            actions: 'updateLocalValue',
          },
        ],
        sliderReleased: {
          target: 'idle',
          actions: ['commitValue', 'endInteraction'],
        },
        inputChanged: {
          target: 'idle',
          actions: ['updateLocalValue', 'commitValue', 'endInteraction'],
        },
        textInputChanged: {
          target: 'idle',
          actions: ['parseAndCommitText', 'endInteraction'],
        },
      },
    },
  },
});

export type ParameterMachineActor = ActorRefFrom<typeof parameterMachine>;
