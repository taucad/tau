import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { quantityKinds } from '@taucad/units/quantity';
import type { ParameterFieldProjection } from '@taucad/parameters';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';

/* A transient row with `enableContinualOnChange` previews a drag through `onChange`, which the section-view
 * panel turns into a graphics-machine event. Pointer moves can outpace frames, so at most one value per
 * animation frame is sent. */

const angleProjection: ParameterFieldProjection = {
  status: 'unit-bearing',
  instancePointer: '/angle',
  parameterId: 'angle',
  representation: 'binary64',
  constraints: {},
  nativeUnit: 'deg',
  quantityKind: quantityKinds.planeAngle,
  space: 'linear',
  displayUnit: 'deg',
  adornment: '°',
  guessed: false,
};

const transientEdit = { kind: 'transient' } as const;

const fireSliderPointerEvent = (
  element: HTMLElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
): void => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(element, event);
};

/** Holds animation frames until the test runs them, so a frame boundary is explicit. */
const holdAnimationFrames = (): { runFrames: () => void } => {
  let pending: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    pending.push(callback);
    return pending.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  return {
    runFrames() {
      const frames = pending;
      pending = [];
      act(() => {
        for (const frame of frames) {
          frame(0);
        }
      });
    },
  };
};

/** A 10° row whose 100 px slider spans 0–20°, so each pixel is 0.2°. */
const renderContinualRow = (onChange: (value: number) => void) => {
  const view = render(
    <TooltipProvider>
      <ParametersNumber
        enableContinualOnChange
        edit={transientEdit}
        fieldProjection={angleProjection}
        value={10}
        defaultValue={10}
        aria-label='Section angle'
        onChange={onChange}
      />
    </TooltipProvider>,
  );
  const sliderInput = view.container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
  Object.defineProperty(sliderInput, 'offsetWidth', { configurable: true, value: 100 });
  return { view, sliderInput };
};

describe('ParametersNumber continual transient scrub', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send the latest dragged value once per frame while showing every value at once', () => {
    const { runFrames } = holdAnimationFrames();
    const onChange = vi.fn<(value: number) => void>();
    const { sliderInput } = renderContinualRow(onChange);

    fireSliderPointerEvent(sliderInput, 'pointerdown', 0);
    fireSliderPointerEvent(sliderInput, 'pointermove', 10);
    fireSliderPointerEvent(sliderInput, 'pointermove', 20);

    // The row already shows 14° although nothing has been sent.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Section angle' })).toHaveValue('14');

    runFrames();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(14);

    fireSliderPointerEvent(sliderInput, 'pointermove', 30);
    runFrames();
    expect(onChange).toHaveBeenLastCalledWith(16);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('should send a dragged value still waiting for its frame, then the released value, at once on release', () => {
    const { runFrames } = holdAnimationFrames();
    const onChange = vi.fn<(value: number) => void>();
    const { sliderInput } = renderContinualRow(onChange);

    fireSliderPointerEvent(sliderInput, 'pointerdown', 0);
    fireSliderPointerEvent(sliderInput, 'pointermove', 10);
    fireSliderPointerEvent(sliderInput, 'pointermove', 20);
    fireSliderPointerEvent(sliderInput, 'pointerup', 20);

    // This row's authority never echoes 14°, so the release still differs from it and sends 14° again.
    expect(onChange.mock.calls).toEqual([[14], [14]]);

    runFrames();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('should send a dragged value still waiting for its frame on release when it returns to the start value', () => {
    const { runFrames } = holdAnimationFrames();
    const onChange = vi.fn<(value: number) => void>();
    const { sliderInput } = renderContinualRow(onChange);

    fireSliderPointerEvent(sliderInput, 'pointerdown', 0);
    fireSliderPointerEvent(sliderInput, 'pointermove', 10);
    runFrames();
    expect(onChange).toHaveBeenLastCalledWith(12);

    // Back to 10° and released in the same frame: the release equals the start value and sends nothing itself.
    fireSliderPointerEvent(sliderInput, 'pointermove', 0);
    fireSliderPointerEvent(sliderInput, 'pointerup', 0);

    expect(onChange).toHaveBeenLastCalledWith(10);
    runFrames();
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('should send nothing for a drag that is cancelled or unmounted before its frame', () => {
    const { runFrames } = holdAnimationFrames();
    const onChange = vi.fn<(value: number) => void>();
    const cancelled = renderContinualRow(onChange);

    fireSliderPointerEvent(cancelled.sliderInput, 'pointerdown', 0);
    fireSliderPointerEvent(cancelled.sliderInput, 'pointermove', 10);
    fireSliderPointerEvent(cancelled.sliderInput, 'pointercancel', 10);
    runFrames();
    cancelled.view.unmount();

    const unmounted = renderContinualRow(onChange);
    fireSliderPointerEvent(unmounted.sliderInput, 'pointerdown', 0);
    fireSliderPointerEvent(unmounted.sliderInput, 'pointermove', 10);
    unmounted.view.unmount();
    runFrames();

    expect(onChange).not.toHaveBeenCalled();
  });
});
