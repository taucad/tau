import { vi, describe, it, expect } from 'vitest';
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LengthSymbol } from '#constants/length-units.js';
import { toUcumLengthCode } from '#constants/length-units.js';
import { ParametersNumber as ParametersNumberImplementation } from '#components/geometry/parameters/parameters-number.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ParameterCommit } from '#components/geometry/parameters/rjsf-context.js';
import type { ParameterFieldProjection, ParameterSetOutcome, ParameterSetRequest } from '@taucad/parameters';
import { parameterInputMachine } from '@taucad/parameters/input-machine';
import type { ParameterInputMachineInput } from '@taucad/parameters/input-machine';
import { createActor } from 'xstate';

type TestUnits = Readonly<{ sourceSymbol: LengthSymbol; displaySymbol: LengthSymbol }>;

function createUnits(sourceSymbol: LengthSymbol, displaySymbol: LengthSymbol): TestUnits {
  return { sourceSymbol, displaySymbol };
}

// Default units (mm)
const defaultUnits = createUnits('mm', 'mm');

type TestParametersNumberProps = Omit<
  React.ComponentProps<typeof ParametersNumberImplementation>,
  'fieldProjection' | 'edit'
> & {
  readonly descriptor?: 'length' | 'angle' | 'count' | 'quantity' | 'unitless';
  readonly units?: TestUnits;
  readonly fieldProjection?: ParameterFieldProjection;
  readonly parameterCommit?: ParameterCommit;
};

const testProjection = (
  descriptor: TestParametersNumberProps['descriptor'],
  units: TestUnits,
): ParameterFieldProjection => {
  const base: Pick<
    ParameterFieldProjection,
    'instancePointer' | 'parameterId' | 'schema' | 'representation' | 'constraints' | 'guessed'
  > = {
    instancePointer: '/value',
    parameterId: 'value',
    schema: { resource: 'urn:taucad:test:parameter-number', pointer: '/properties/value' },
    representation: 'binary64',
    constraints: {},
    guessed: false,
  };
  if (descriptor === 'length') {
    return {
      ...base,
      status: 'unit-bearing',
      nativeUnit: toUcumLengthCode(units.sourceSymbol),
      displayUnit: toUcumLengthCode(units.displaySymbol),
      adornment: units.displaySymbol,
      quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      space: 'linear',
    };
  }
  if (descriptor === 'angle') {
    return {
      ...base,
      status: 'unit-bearing',
      nativeUnit: 'deg',
      displayUnit: 'deg',
      adornment: '°',
      quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
      space: 'linear',
    };
  }
  if (descriptor === 'count') {
    return { ...base, status: 'dimensionless', nativeUnit: '1', displayUnit: '1', adornment: '×' };
  }
  if (descriptor === 'unitless') {
    return { ...base, status: 'dimensionless', nativeUnit: '1', displayUnit: '1' };
  }
  return { ...base, status: 'unknown' };
};

function ParametersNumber({
  descriptor,
  units = defaultUnits,
  fieldProjection,
  parameterCommit,
  ...properties
}: TestParametersNumberProps): React.JSX.Element {
  const projection = React.useMemo(
    () => fieldProjection ?? testProjection(descriptor, units),
    [descriptor, fieldProjection, units],
  );
  return (
    <ParametersNumberImplementation
      {...properties}
      fieldProjection={projection}
      edit={parameterCommit ? { kind: 'authoritative', commit: parameterCommit } : { kind: 'transient' }}
    />
  );
}

/** The service resolves the acknowledged value and revision from the authority; tests stand in for it. */
const authorityIdentity = {
  sourceRevision: 'source-1',
  manifestRevision: 'manifest-1',
  valueRevision: 'value-1',
  dependencyRevision: 'dependency-1',
};

const machineInput = (request: Parameters<ParameterCommit['input']>[0]): ParameterInputMachineInput => ({
  ...request,
  acknowledgedValue: request.acknowledgedValue ?? 0,
  acknowledgedRevision: request.acknowledgedRevision ?? authorityIdentity,
});

const createRetainedInput = (
  submit?: (request: ParameterSetRequest) => Promise<ParameterSetOutcome>,
): ParameterCommit['input'] => {
  let retained: ReturnType<ParameterCommit['input']> | undefined;
  return (input) => {
    if (retained === undefined) {
      const actor = createActor(parameterInputMachine, { input: machineInput(input) });
      if (submit !== undefined) {
        const settle = async (request: ParameterSetRequest): Promise<void> => {
          const outcome = await submit(request);
          actor.send({ type: 'settleSubmission', generation: request.draftGeneration, outcome });
        };
        actor.on('parameterSetIntent', (event) => {
          void settle(event.request);
        });
      }
      actor.start();
      retained = { actor, attach: () => () => undefined };
    }
    return retained;
  };
};

const fireSliderPointerEvent = (
  element: HTMLElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove',
  { clientX, pointerId = 1 }: { readonly clientX: number; readonly pointerId?: number },
): void => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  fireEvent(element, event);
};

// Test wrapper component that provides TooltipProvider
function TestWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ParametersNumber', () => {
  describe('Basic Rendering', () => {
    it('should render with default mm unit for length', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Should show the value
      expect(screen.getByDisplayValue('10')).toBeTruthy();
      // Should show mm unit
      expect(screen.getByText('mm')).toBeTruthy();
    });

    it('should render with angle descriptor', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={45}
            defaultValue={45}
            descriptor='angle'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('45')).toBeTruthy();
    });

    it('should render with count descriptor', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={5}
            defaultValue={5}
            descriptor='count'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('5')).toBeTruthy();
      expect(screen.getByText('×')).toBeTruthy();
    });

    it('should render with unitless descriptor', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={1.5}
            defaultValue={1.5}
            descriptor='unitless'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('1.5')).toBeTruthy();
    });
  });

  describe('Unit Conversion', () => {
    it('commits one displayed millimetre keyboard step as 0.001 source metres', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={0.016}
            defaultValue={0}
            descriptor='length'
            units={createUnits('m', 'mm')}
            step={0.001}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('16');
      await user.click(input);
      await user.keyboard('{ArrowUp}');

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith(0.017);
        expect(input).toHaveValue('17');
      });
    });

    it('should convert from mm to inches and back', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits('mm', 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Value should be converted to 1 inch (25.4mm / 25.4 = 1in)
      expect(screen.getByDisplayValue('1')).toBeTruthy();

      // Should show 'in' unit
      expect(screen.getByText('in')).toBeTruthy();
    });

    it('should show approximation indicator when conversion results in rounding', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits('mm', 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Should show approximation indicator
      expect(screen.getByText('≈')).toBeTruthy();

      // Tooltip content testing is complex in unit tests (requires hover/focus simulation)
      // The important part is that the approximation indicator is shown
    });

    it('should not show approximation indicator for exact conversions', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits('mm', 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('1')).toBeTruthy();

      // Should NOT show approximation indicator
      expect(screen.queryByText('≈')).toBeNull();
    });

    it('should always call onChange with mm values regardless of display unit', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      const inchUnits = createUnits('mm', 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      expect(screen.getByDisplayValue('1')).toBeTruthy();

      // Clear and type new value in inches
      const input = screen.getByDisplayValue('1');
      await user.clear(input);
      await user.type(input, '2');
      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');

      // The confirmed draft is committed in the native unit.
      expect(mockOnChange.mock.calls[0]?.[0]).toBeCloseTo(50.8, 12);
    });

    it('should format values with 4 significant figures during conversion', () => {
      const mockOnChange = vi.fn();
      const inchUnits = createUnits('mm', 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={123.456}
            defaultValue={123.456}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole<HTMLInputElement>('textbox');
      // 123.456mm / 25.4 ≈ 4.860 inches (4 sig figs)
      expect(input.value).toMatch(/^4\.86/);
    });
  });

  describe('Unified Number Field', () => {
    it('should render a fill bar proportional to the value', () => {
      const mockOnChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <ParametersNumber
            value={50}
            defaultValue={50}
            descriptor='length'
            min={0}
            max={100}
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const fillBar = container.querySelector('[class*="bg-primary"]');
      expect(fillBar).toBeTruthy();
      expect((fillBar as HTMLElement).style.width).toBe('50%');
    });

    it('should place an unbounded positive default at the middle of its automatic range', () => {
      const { container } = render(
        <TestWrapper>
          <ParametersNumber value={14} defaultValue={14} descriptor='length' units={defaultUnits} onChange={vi.fn()} />
        </TestWrapper>,
      );

      expect(container.querySelector<HTMLElement>('[data-slot="slider-input-fill"]')?.style.width).toBe('50%');
    });

    it('should clamp fill bar to 0-100%', () => {
      const mockOnChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <ParametersNumber
            value={0}
            defaultValue={0}
            descriptor='length'
            min={0}
            max={100}
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const fillBar = container.querySelector('[class*="bg-primary"]');
      expect(fillBar).toBeTruthy();
      expect((fillBar as HTMLElement).style.width).toBe('0%');
    });

    it('should accept the next external value after pointer cancellation', () => {
      const mockOnChange = vi.fn();
      const properties = {
        defaultValue: 50,
        descriptor: 'length',
        min: 0,
        max: 100,
        units: defaultUnits,
        onChange: mockOnChange,
      } satisfies Omit<React.ComponentProps<typeof ParametersNumber>, 'value'>;
      const { container, rerender } = render(
        <TestWrapper>
          <ParametersNumber {...properties} value={50} />
        </TestWrapper>,
      );
      const sliderInput = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
      Object.defineProperty(sliderInput, 'offsetWidth', {
        configurable: true,
        value: 100,
      });

      fireSliderPointerEvent(sliderInput, 'pointerdown', { clientX: 0 });
      fireSliderPointerEvent(sliderInput, 'pointermove', { clientX: 25 });
      fireSliderPointerEvent(sliderInput, 'pointercancel', { clientX: 25 });
      expect(mockOnChange).not.toHaveBeenCalled();

      rerender(
        <TestWrapper>
          <ParametersNumber {...properties} value={20} />
        </TestWrapper>,
      );
      expect(screen.getByRole('textbox')).toHaveValue('20');
    });

    it('should enter edit mode on focus and show the input', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');
      expect(input.className).toContain('opacity-0');

      act(() => {
        input.focus();
      });
      expect(input.className).toContain('opacity-100');
    });

    it('should exit edit mode on blur', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');
      act(() => {
        input.focus();
      });
      expect(input.className).toContain('opacity-100');

      act(() => {
        input.blur();
      });
      expect(input.className).toContain('opacity-0');
    });

    it('should revert text on Escape', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      act(() => {
        input.focus();
      });
      await user.clear(input);
      await user.type(input, '999');
      await user.keyboard('{Escape}');

      expect(input).toHaveValue('10');
    });
  });

  describe('Input Field Interactions', () => {
    it('gives sibling authoritative inputs disjoint request identities', () => {
      const editorInstances = new Map<string, string>();
      const actors = new Map<string, ReturnType<ParameterCommit['input']>['actor']>();
      const input: ParameterCommit['input'] = (actorInput) => {
        editorInstances.set(actorInput.binding.pointer, actorInput.editorInstance);
        let actor = actors.get(actorInput.editorInstance);
        if (actor === undefined) {
          actor = createActor(parameterInputMachine, { input: machineInput(actorInput) });
          actor.start();
          actors.set(actorInput.editorInstance, actor);
        }
        return { actor, attach: () => () => undefined };
      };
      const parameterCommit: ParameterCommit = {
        target: { authority: 'test', root: '/', entry: 'main.ts' },
        group: 'default',
        editorInstance: 'shared-editor',
        input,
        setValue: vi.fn(async () => undefined),
      };

      const view = render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            fieldProjection={{
              ...testProjection('length', defaultUnits),
              parameterId: 'width',
              instancePointer: '/width',
            }}
            parameterCommit={parameterCommit}
            onChange={vi.fn()}
            aria-label='Width'
          />
          <ParametersNumber
            value={10}
            defaultValue={10}
            fieldProjection={{
              ...testProjection('length', defaultUnits),
              parameterId: 'height',
              instancePointer: '/height',
            }}
            parameterCommit={parameterCommit}
            onChange={vi.fn()}
            aria-label='Height'
          />
        </TestWrapper>,
      );

      expect(editorInstances.get('/width')).not.toBe(editorInstances.get('/height'));
      view.unmount();
      for (const actor of actors.values()) {
        actor.stop();
      }
    });

    it('keeps a dirty draft when the row re-renders with an equal but re-created binding', async () => {
      const user = userEvent.setup();
      const retain = createRetainedInput();
      let retained: ReturnType<ParameterCommit['input']> | undefined;
      const input: ParameterCommit['input'] = (request) => {
        retained = retain(request);
        return retained;
      };
      const parameterCommit: ParameterCommit = {
        target: { authority: 'test', root: '/', entry: 'main.ts' },
        group: 'default',
        editorInstance: 'echo-editor',
        input,
        setValue: vi.fn(async () => undefined),
      };
      const row = (projection: ReturnType<typeof testProjection>) => (
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            fieldProjection={projection}
            parameterCommit={parameterCommit}
            onChange={vi.fn()}
            aria-label='Echo width'
          />
        </TestWrapper>
      );
      const view = render(row({ ...testProjection('length', defaultUnits), instancePointer: '/width' }));
      const actor = retained?.actor;
      if (actor === undefined) {
        throw new Error('The row did not retain an input actor.');
      }
      const sent: string[] = [];
      const send = actor.send.bind(actor);
      actor.send = (event) => {
        sent.push(event.type);
        send(event);
      };
      const field = screen.getByRole('textbox', { name: 'Echo width' });
      await user.click(field);
      await user.clear(field);
      await user.type(field, '12');
      view.rerender(row({ ...testProjection('length', defaultUnits), instancePointer: '/width' }));

      expect(sent).not.toContain('refreshAuthority');
      expect(actor.getSnapshot().context.draft).toMatchObject({ raw: '12', dirty: true });
      expect(actor.getSnapshot().context.draft?.conflict).toBeUndefined();
    });

    it('restores retained invalid text into the visible input after remount', async () => {
      const user = userEvent.setup();
      const input = createRetainedInput();
      const parameterCommit: ParameterCommit = {
        target: { authority: 'test', root: '/', entry: 'main.ts' },
        group: 'default',
        editorInstance: 'retained-editor',
        input,
        setValue: vi.fn(async () => undefined),
      };
      const view = (
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            parameterCommit={parameterCommit}
            onChange={vi.fn()}
            aria-label='Retained width'
          />
        </TestWrapper>
      );
      const first = render(view);
      const field = screen.getByRole('textbox', { name: 'Retained width' });
      await user.click(field);
      await user.clear(field);
      await user.type(field, 'invalid draft');
      first.unmount();

      render(view);
      const restored = screen.getByRole('textbox', { name: 'Retained width' });
      expect(restored).toHaveValue('invalid draft');
    });

    it('rejects transient text outside the admitted constraints', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            fieldProjection={{
              ...testProjection('length', defaultUnits),
              constraints: { minimum: 0, maximum: 20 },
            }}
            onChange={onChange}
            aria-label='Constrained width'
          />
        </TestWrapper>,
      );
      const field = screen.getByRole('textbox', { name: 'Constrained width' });
      await user.click(field);
      await user.clear(field);
      await user.type(field, '999');
      await user.keyboard('{Enter}');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText('Value must be at most 20.')).toBeVisible();
    });

    it.each<{
      name: string;
      projection: Pick<ParameterFieldProjection, 'constraints' | 'representation'>;
      text: string;
      diagnostic: string;
    }>([
      {
        name: 'exclusive bound',
        projection: { constraints: { exclusiveMaximum: 20 }, representation: 'binary64' },
        text: '20',
        diagnostic: 'Value must be less than 20.',
      },
      {
        name: 'multiple-of lattice',
        projection: { constraints: { multipleOf: 0.5 }, representation: 'binary64' },
        text: '10.25',
        diagnostic: 'Value must be a multiple of 0.5.',
      },
      {
        name: 'safe-integer representation',
        projection: { constraints: {}, representation: 'safe-integer' },
        text: String(Number.MAX_SAFE_INTEGER + 1),
        diagnostic: 'Input does not preserve a safe integer in the native unit.',
      },
    ])('rejects transient $name without a geometry update', async ({ projection, text, diagnostic }) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            fieldProjection={{ ...testProjection('length', defaultUnits), ...projection }}
            onChange={onChange}
            aria-label='Admitted transient value'
          />
        </TestWrapper>,
      );
      const field = screen.getByRole('textbox', { name: 'Admitted transient value' });
      await user.click(field);
      await user.clear(field);
      await user.type(field, text);
      await user.keyboard('{Enter}');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText(diagnostic)).toBeVisible();
      expect(field).toHaveValue(text);
    });

    it('converts an explicit display unit and waits for the authority outcome before acknowledging it', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      let settle: ((outcome: ParameterSetOutcome) => void) | undefined;
      const submit = vi.fn(async (_request: ParameterSetRequest) => {
        const outcome = await new Promise<ParameterSetOutcome>((resolve) => {
          settle = resolve;
        });
        return outcome;
      });
      const identity = authorityIdentity;

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            fieldProjection={{
              status: 'unit-bearing',
              schema: { resource: 'urn:taucad:test:provider-configuration', pointer: '/properties/width' },
              instancePointer: '/width',
              parameterId: 'width',
              representation: 'binary64',
              constraints: {},
              nativeUnit: 'mm',
              displayUnit: 'mm',
              adornment: 'mm',
              guessed: false,
            }}
            parameterCommit={{
              target: {
                authority: 'provider-configuration',
                root: '/project',
                entry: 'provider-configuration/runtime/export/stl/options',
              },
              group: 'default',
              editorInstance: 'test-editor',
              input: createRetainedInput(submit),
              setValue: vi.fn(async () => undefined),
            }}
            onChange={onChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.type(input, '2.1 cm');
      await user.keyboard('{Enter}');

      expect(submit).toHaveBeenCalledOnce();
      const request = submit.mock.calls[0]?.[0];
      expect(request).toMatchObject({
        expected: identity,
        operation: {
          kind: 'unit-value',
          group: 'default',
          parameterId: 'width',
          pointer: '/width',
          inputUnit: 'cm',
          value: '2.1 cm',
        },
      });
      expect(onChange).not.toHaveBeenCalled();
      if (request === undefined) {
        throw new Error('Expected a submitted parameter request');
      }

      await act(async () => {
        settle?.({
          status: 'committed',
          requestId: request.requestId,
          write: 'applied',
          revision: { ...identity, valueRevision: 'value-2' },
        });
      });

      expect(input).toHaveValue('21');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should update value when typing in input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.type(input, '25');
      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');

      // Complete text drafts commit on Enter.
      expect(mockOnChange).toHaveBeenCalledWith(25);
    });

    it('should not commit value on blur if user did not edit', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');

      // Focus and blur without editing
      await user.click(input);
      await user.tab();

      // OnChange should NOT be called on blur without edit
      // (it might have been called during render/initialization, but not from blur)
      const callCount = mockOnChange.mock.calls.length;

      // Click again and blur again
      await user.click(input);
      await user.tab();

      // Call count should not increase
      expect(mockOnChange.mock.calls.length).toBe(callCount);
    });

    it('should not commit approximated value on blur without edit', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      const inchUnits = createUnits('mm', 'in');

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={inchUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      // Should show approximation indicator
      expect(screen.getByText('≈')).toBeTruthy();

      mockOnChange.mockClear();

      const input = screen.getByRole('textbox');

      // Focus and blur without editing
      await user.click(input);
      await user.tab();

      // OnChange should NOT be called
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should parse length input with units', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('25.4');
      await user.clear(input);
      await user.type(input, '1 in');

      // Equivalent input is a semantic no-op before and after confirmation.
      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should convert display value on Enter without emitting onChange', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={25.4}
            defaultValue={25.4}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('25.4');
      await user.clear(input);
      await user.type(input, '1in');

      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      expect(mockOnChange).not.toHaveBeenCalled();

      // Display value should be updated to the converted value (25.4mm displayed as "25.4")
      // After blur, the input should show the formatted value
      const updatedInput = screen.getByDisplayValue('25.4');
      expect(updatedInput).toBeInTheDocument();
    });

    it('should parse fractional input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.type(input, '1/2 in');

      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      expect(mockOnChange.mock.calls[0]?.[0]).toBeCloseTo(12.7, 12);
    });

    it('should parse feet and inches notation', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.type(input, "1'");

      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      expect(mockOnChange).toHaveBeenCalledWith(304.8);
    });

    it('should handle empty input gracefully', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);

      // Empty input should not call onChange
      // The input should be empty but not propagate
      expect(input).toHaveValue('');
    });

    it('should restore original value when blurring empty input', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');
      await user.clear(input);
      await user.tab();

      // Should restore to original value
      expect(input).toHaveValue('10');
    });

    it('should update input value in real-time when arrow keys are pressed while focused', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');

      // Focus the input
      await user.click(input);
      expect(input).toHaveFocus();

      // Press arrow up (should increment by step)
      await user.keyboard('{ArrowUp}');

      // Input should show updated value immediately (10 + 1 = 11)
      expect(input).toHaveValue('11');

      // OnChange should have been called with the new value in mm
      expect(mockOnChange).toHaveBeenCalledWith(11);

      // Press arrow down (should decrement by step)
      mockOnChange.mockClear();
      await user.keyboard('{ArrowDown}');

      // Input should show updated value immediately (11 - 1 = 10)
      expect(input).toHaveValue('10');

      // OnChange should have been called with the new value in mm
      expect(mockOnChange).toHaveBeenCalledWith(10);
    });

    it('should not overwrite user typing after arrow key press', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('10');

      // Focus the input
      await user.click(input);

      // Press arrow up
      await user.keyboard('{ArrowUp}');
      expect(input).toHaveValue('11');

      // Start typing - this should preserve user input
      await user.keyboard('5');

      // Input should show user's typing, not be overwritten
      expect(input).toHaveValue('115');
    });
  });

  describe('Disabled State', () => {
    it('should disable input when disabled prop is true', () => {
      const mockOnChange = vi.fn();

      render(
        <TestWrapper>
          <ParametersNumber
            disabled
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should not call onChange when disabled', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            disabled
            value={10}
            defaultValue={10}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByRole('textbox');

      // Try to type in disabled input
      await user.type(input, '5');

      // OnChange should not be called
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should group a committed standalone value without changing its edit value', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={123_456_789}
            defaultValue={1}
            descriptor='unitless'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('123,456,789');
      await user.click(input);
      expect(input).toHaveValue('123,456,789');
    });

    it('should handle decimal precision correctly', async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ParametersNumber
            value={0.1}
            defaultValue={0.1}
            descriptor='length'
            units={defaultUnits}
            onChange={mockOnChange}
          />
        </TestWrapper>,
      );

      const input = screen.getByDisplayValue('0.1');
      await user.clear(input);
      await user.type(input, '0.123456789');
      expect(mockOnChange).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');

      // Committed native precision is not reduced to display precision.
      expect(mockOnChange).toHaveBeenCalledWith(Number('0.123456789'));
    });
  });
});
