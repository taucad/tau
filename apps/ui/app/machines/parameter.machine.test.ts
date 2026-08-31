import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, fromCallback } from 'xstate';
import { parameterMachine } from '#machines/parameter.machine.js';
import type { ParameterEmitted, ParameterInput } from '#machines/parameter.machine.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createDefaultInput(overrides?: Partial<ParameterInput>): ParameterInput {
  return {
    initialValue: 50,
    defaultValue: 50,
    descriptor: 'length',
    enableContinualOnChange: false,
    initialSourceSymbol: 'mm',
    initialDisplaySymbol: 'mm',
    ...overrides,
  };
}

/* oxlint-disable no-empty-function -- no-op stub for the global keyboard listener */
const keydownNoop = fromCallback<{ type: 'keyStateChanged'; key: string; isPressed: boolean }, { key: string }>(
  () => () => {},
);
/* oxlint-enable no-empty-function */

function createTestActor(overrides?: Partial<ParameterInput>) {
  const machine = parameterMachine.provide({
    actors: {
      keydownListener: keydownNoop,
    },
  });

  return createActor(machine, {
    input: createDefaultInput(overrides),
  });
}

function collectEmitted(actor: ReturnType<typeof createTestActor>): ParameterEmitted[] {
  const emitted: ParameterEmitted[] = [];
  actor.on('valueCommit', (event) => emitted.push(event));
  return emitted;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parameterMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Context initialization
  // =========================================================================
  describe('context initialization', () => {
    it('does not reinterpret a millimetre source value as metres when the viewer displays millimetres', () => {
      const actor = createTestActor({
        initialValue: 0.5,
        defaultValue: 0.5,
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'mm',
      });
      actor.start();
      expect(actor.getSnapshot().context.localValue).toBe(0.5);
      expect(actor.getSnapshot().context.isApproximation).toBe(false);
      actor.stop();
    });

    it('should initialize with correct defaults for length descriptor', () => {
      const actor = createTestActor({ initialValue: 50, defaultValue: 50, descriptor: 'length' });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.committedValue).toBe(50);
      expect(context.localValue).toBe(50);
      expect(context.isFocused).toBe(false);
      expect(context.isDragging).toBe(false);
      expect(context.descriptor).toBe('length');
      expect(context.currentSourceSymbol).toBe('mm');
      expect(context.currentDisplaySymbol).toBe('mm');
      expect(context.displayUnit).toBe('mm');
      expect(context.isShiftHeld).toBe(false);
      expect(context.lastEmittedValue).toBeUndefined();
      actor.stop();
    });

    it('should initialize with unit conversion for length in inches', () => {
      const actor = createTestActor({
        initialValue: 25.4,
        defaultValue: 25.4,
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'in',
      });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.committedValue).toBe(25.4);
      expect(context.localValue).toBe(1);
      expect(context.currentSourceSymbol).toBe('mm');
      expect(context.currentDisplaySymbol).toBe('in');
      expect(context.displayUnit).toBe('in');
      actor.stop();
    });

    it.each([
      { sourceSymbol: 'm', displaySymbol: 'mm', sourceValue: 0.5, displayValue: 500 },
      { sourceSymbol: 'mm', displaySymbol: 'm', sourceValue: 500, displayValue: 0.5 },
    ] as const)(
      'converts $sourceSymbol source values to $displaySymbol without changing source semantics',
      ({ sourceSymbol, displaySymbol, sourceValue, displayValue }) => {
        const actor = createTestActor({
          initialValue: sourceValue,
          defaultValue: sourceValue,
          initialSourceSymbol: sourceSymbol,
          initialDisplaySymbol: displaySymbol,
        });
        actor.start();
        expect(actor.getSnapshot().context.localValue).toBe(displayValue);
        const emitted = collectEmitted(actor);
        actor.send({ type: 'inputChanged', value: displayValue });
        expect(emitted[0]!.value).toBe(sourceValue);
        actor.stop();
      },
    );

    it('should ignore unit factor for non-length descriptors', () => {
      const actor = createTestActor({
        initialValue: 45,
        defaultValue: 45,
        descriptor: 'angle',
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'in',
      });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.localValue).toBe(45);
      expect(context.currentSourceSymbol).toBe('mm');
      expect(context.displayUnit).toBe('');
      actor.stop();
    });

    it('should calculate range for zero default value', () => {
      const actor = createTestActor({ initialValue: 0, defaultValue: 0 });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.rangeMin).toBe(-100);
      expect(context.rangeMax).toBe(100);
      expect(context.baseStep).toBe(0.01);
      actor.stop();
    });

    it('should calculate range using tier-based scaling for positive values', () => {
      const actor = createTestActor({ initialValue: 60, defaultValue: 60 });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.rangeMin).toBe(0);
      // 60*2=120 >= 100 (next tier), so expand: 100*2 = 200
      expect(context.rangeMax).toBe(200);
      actor.stop();
    });

    it('should calculate range for small positive values', () => {
      const actor = createTestActor({ initialValue: 30, defaultValue: 30 });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.rangeMin).toBe(0);
      // 30*2=60 < 100, so rangeMax = 100
      expect(context.rangeMax).toBe(100);
      actor.stop();
    });

    it('should calculate range for negative values', () => {
      const actor = createTestActor({ initialValue: -50, defaultValue: -50 });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.rangeMax).toBe(0);
      // |-50|*2=100 >= 100, so expand: 100*2=200 → min = -200
      expect(context.rangeMin).toBe(-200);
      actor.stop();
    });

    it('should use provided min/max/step when specified', () => {
      const actor = createTestActor({
        initialValue: 50,
        defaultValue: 50,
        min: 10,
        max: 200,
        step: 5,
      });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.rangeMin).toBe(10);
      expect(context.rangeMax).toBe(200);
      expect(context.baseStep).toBe(5);
      actor.stop();
    });
  });

  // =========================================================================
  // Slider interactions
  // =========================================================================
  describe('slider interactions', () => {
    it('should update local value on sliderChanged without committing (default mode)', () => {
      const actor = createTestActor();
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'sliderChanged', value: 75 });
      const { context } = actor.getSnapshot();
      expect(context.localValue).toBe(75);
      expect(context.isDragging).toBe(true);
      expect(emitted).toHaveLength(0);
      actor.stop();
    });

    it('should commit value on sliderReleased', () => {
      const actor = createTestActor();
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'sliderChanged', value: 75 });
      actor.send({ type: 'sliderReleased', value: 75 });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.value).toBe(75);
      expect(actor.getSnapshot().context.isDragging).toBe(false);
      actor.stop();
    });

    it('should commit on every sliderChanged when enableContinualOnChange is true', () => {
      const actor = createTestActor({ enableContinualOnChange: true });
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'sliderChanged', value: 60 });
      actor.send({ type: 'sliderChanged', value: 70 });
      expect(emitted).toHaveLength(2);
      expect(emitted[0]!.value).toBe(60);
      expect(emitted[1]!.value).toBe(70);
      actor.stop();
    });

    it('should convert a slider edit from display units to source units', () => {
      const actor = createTestActor({
        initialValue: 25.4,
        defaultValue: 25.4,
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'in',
      });
      actor.start();
      const emitted = collectEmitted(actor);
      // Slider moves to 2 inches
      actor.send({ type: 'sliderChanged', value: 2 });
      actor.send({ type: 'sliderReleased', value: 2 });
      expect(emitted).toHaveLength(1);
      // 2 inches * 25.4 = 50.8 mm
      expect(emitted[0]!.value).toBeCloseTo(50.8);
      actor.stop();
    });
  });

  // =========================================================================
  // Input changes
  // =========================================================================
  describe('input changes', () => {
    it('should commit value immediately on inputChanged', () => {
      const actor = createTestActor();
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'inputChanged', value: 80 });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.value).toBe(80);
      actor.stop();
    });
  });

  // =========================================================================
  // Text input parsing
  // =========================================================================
  describe('text input parsing', () => {
    it('should parse plain number text', () => {
      const actor = createTestActor({ descriptor: 'unitless' });
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'textInputChanged', text: '42' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.value).toBe(42);
      actor.stop();
    });

    it('should ignore empty text', () => {
      const actor = createTestActor();
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'textInputChanged', text: '' });
      expect(emitted).toHaveLength(0);
      actor.stop();
    });

    it('should not emit for unparseable text', () => {
      const actor = createTestActor({ descriptor: 'unitless' });
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'textInputChanged', text: 'abc' });
      expect(emitted).toHaveLength(0);
      actor.stop();
    });

    it('should parse length input with mm unit', () => {
      const actor = createTestActor({
        initialValue: 50,
        defaultValue: 50,
        descriptor: 'length',
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'mm',
      });
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'textInputChanged', text: '100mm' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.value).toBeCloseTo(100);
      actor.stop();
    });

    it('should commit explicit typed units into the declared source unit', () => {
      const actor = createTestActor({
        initialValue: 0,
        defaultValue: 0,
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'm',
      });
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'textInputChanged', text: '2in' });
      expect(emitted[0]!.value).toBeCloseTo(50.8);
      expect(actor.getSnapshot().context.localValue).toBeCloseTo(0.0508);
      actor.stop();
    });
  });

  // =========================================================================
  // External value changes
  // =========================================================================
  describe('external value changes', () => {
    it('should accept external value when not interacting', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'externalValueChanged', value: 100 });
      const { context } = actor.getSnapshot();
      expect(context.committedValue).toBe(100);
      expect(context.localValue).toBe(100);
      actor.stop();
    });

    it('should reject external value when focused', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'focusStateChanged', isFocused: true });
      actor.send({ type: 'externalValueChanged', value: 999 });
      const { context } = actor.getSnapshot();
      expect(context.committedValue).toBe(50);
      actor.stop();
    });

    it('should reject external value when dragging', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'sliderChanged', value: 60 });
      expect(actor.getSnapshot().context.isDragging).toBe(true);
      actor.send({ type: 'externalValueChanged', value: 999 });
      expect(actor.getSnapshot().context.committedValue).toBe(50);
      actor.stop();
    });
  });

  // =========================================================================
  // Shift key step multiplier
  // =========================================================================
  describe('shift key modifier', () => {
    it('should multiply step by 5x when shift is pressed', () => {
      const actor = createTestActor();
      actor.start();
      const { baseStep } = actor.getSnapshot().context;
      actor.send({ type: 'keyStateChanged', key: 'Shift', isPressed: true });
      const { context } = actor.getSnapshot();
      expect(context.isShiftHeld).toBe(true);
      expect(context.step).toBe(baseStep * 5);
      actor.stop();
    });

    it('should restore base step when shift is released', () => {
      const actor = createTestActor();
      actor.start();
      const { baseStep } = actor.getSnapshot().context;
      actor.send({ type: 'keyStateChanged', key: 'Shift', isPressed: true });
      actor.send({ type: 'keyStateChanged', key: 'Shift', isPressed: false });
      expect(actor.getSnapshot().context.step).toBe(baseStep);
      expect(actor.getSnapshot().context.isShiftHeld).toBe(false);
      actor.stop();
    });

    it('should ignore non-Shift key events', () => {
      const actor = createTestActor();
      actor.start();
      const stepBefore = actor.getSnapshot().context.step;
      actor.send({ type: 'keyStateChanged', key: 'Control', isPressed: true });
      expect(actor.getSnapshot().context.step).toBe(stepBefore);
      expect(actor.getSnapshot().context.isShiftHeld).toBe(false);
      actor.stop();
    });
  });

  // =========================================================================
  // Unit changes
  // =========================================================================
  describe('unit changes', () => {
    it('should recalculate local value and range on unit change', () => {
      const actor = createTestActor({
        initialValue: 25.4,
        defaultValue: 25.4,
        descriptor: 'length',
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'mm',
      });
      actor.start();
      expect(actor.getSnapshot().context.localValue).toBe(25.4);

      actor.send({ type: 'unitChanged', sourceSymbol: 'mm', displaySymbol: 'in' });
      const { context } = actor.getSnapshot();
      expect(context.localValue).toBeCloseTo(1);
      expect(context.currentSourceSymbol).toBe('mm');
      expect(context.currentDisplaySymbol).toBe('in');
      expect(context.displayUnit).toBe('in');
      actor.stop();
    });

    it('should not apply unit conversion for non-length descriptors', () => {
      const actor = createTestActor({
        initialValue: 90,
        defaultValue: 90,
        descriptor: 'angle',
      });
      actor.start();
      actor.send({ type: 'unitChanged', sourceSymbol: 'mm', displaySymbol: 'in' });
      expect(actor.getSnapshot().context.localValue).toBe(90);
      expect(actor.getSnapshot().context.currentSourceSymbol).toBe('mm');
      actor.stop();
    });
  });

  // =========================================================================
  // Config changes
  // =========================================================================
  describe('config changes', () => {
    it('should update default value and recalculate range', () => {
      const actor = createTestActor({ initialValue: 50, defaultValue: 50 });
      actor.start();
      const originalMax = actor.getSnapshot().context.rangeMax;
      actor.send({ type: 'configChanged', defaultValue: 500 });
      const newMax = actor.getSnapshot().context.rangeMax;
      expect(newMax).not.toBe(originalMax);
      expect(actor.getSnapshot().context.defaultValue).toBe(500);
      actor.stop();
    });

    it('should update descriptor from length to angle', () => {
      const actor = createTestActor({
        initialValue: 50,
        defaultValue: 50,
        descriptor: 'length',
        initialSourceSymbol: 'mm',
        initialDisplaySymbol: 'in',
      });
      actor.start();
      expect(actor.getSnapshot().context.displayUnit).toBe('in');

      actor.send({ type: 'configChanged', descriptor: 'angle' });
      expect(actor.getSnapshot().context.descriptor).toBe('angle');
      expect(actor.getSnapshot().context.displayUnit).toBe('');
      actor.stop();
    });

    it('should update min/max/step constraints', () => {
      const actor = createTestActor({ initialValue: 50, defaultValue: 50 });
      actor.start();
      actor.send({ type: 'configChanged', min: 10, max: 200, step: 5 });
      const { context } = actor.getSnapshot();
      expect(context.min).toBe(10);
      expect(context.max).toBe(200);
      expect(context.originalStep).toBe(5);
      expect(context.rangeMin).toBe(10);
      expect(context.rangeMax).toBe(200);
      expect(context.baseStep).toBe(5);
      actor.stop();
    });

    it('should toggle enableContinualOnChange', () => {
      const actor = createTestActor({ enableContinualOnChange: false });
      actor.start();
      actor.send({ type: 'configChanged', enableContinualOnChange: true });
      expect(actor.getSnapshot().context.enableContinualOnChange).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // Duplicate emission prevention
  // =========================================================================
  describe('duplicate emission prevention', () => {
    it('should not emit duplicate valueCommit for the same source value', () => {
      const actor = createTestActor();
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'inputChanged', value: 75 });
      actor.send({ type: 'inputChanged', value: 75 });
      expect(emitted).toHaveLength(1);
      actor.stop();
    });

    it('should emit again when value changes after duplicate', () => {
      const actor = createTestActor();
      actor.start();
      const emitted = collectEmitted(actor);
      actor.send({ type: 'inputChanged', value: 75 });
      actor.send({ type: 'inputChanged', value: 75 });
      actor.send({ type: 'inputChanged', value: 80 });
      expect(emitted).toHaveLength(2);
      expect(emitted[1]!.value).toBe(80);
      actor.stop();
    });
  });

  // =========================================================================
  // Focus state
  // =========================================================================
  describe('focus state', () => {
    it('should track focus state', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'focusStateChanged', isFocused: true });
      expect(actor.getSnapshot().context.isFocused).toBe(true);
      actor.send({ type: 'focusStateChanged', isFocused: false });
      expect(actor.getSnapshot().context.isFocused).toBe(false);
      actor.stop();
    });
  });
});
