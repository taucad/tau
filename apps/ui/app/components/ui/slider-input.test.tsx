// @vitest-environment jsdom
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SliderInput, snapToStep } from '#components/ui/slider-input.js';
import type { SliderInputProperties } from '#components/ui/slider-input.js';

const defaultProperties = {
  value: 50,
  min: 0,
  max: 100,
  step: 1,
  'aria-label': 'Amount',
} satisfies Pick<SliderInputProperties, 'aria-label' | 'max' | 'min' | 'step' | 'value'>;

const renderSlider = (properties: Partial<SliderInputProperties> = {}) =>
  render(<SliderInput {...defaultProperties} {...properties} />);

const setSliderWidth = (element: HTMLElement, width = 100): void => {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: width });
};

const fireSliderPointerEvent = (
  element: HTMLElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup',
  { button = 0, clientX, pointerId }: { button?: number; clientX: number; pointerId: number },
): void => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  fireEvent(element, event);
};

const scrub = (
  element: HTMLElement,
  { pointerId = 1, startX = 0, endX = 25 }: { pointerId?: number; startX?: number; endX?: number } = {},
): void => {
  fireSliderPointerEvent(element, 'pointerdown', { clientX: startX, pointerId });
  fireSliderPointerEvent(element, 'pointermove', { clientX: endX, pointerId });
};

describe('snapToStep', () => {
  it.each([
    { value: 0.299, step: 0.01, min: 0, expected: 0.3 },
    { value: 0.1 + 0.2, step: 0.1, min: 0, expected: 0.3 },
    { value: 17, step: 5, min: 0, expected: 15 },
    { value: 18, step: 5, min: 0, expected: 20 },
    { value: 0.16, step: 0.1, min: 0.05, expected: 0.15 },
    { value: 0.21, step: 0.1, min: 0.05, expected: 0.25 },
    { value: -0.299, step: 0.01, min: 0, expected: -0.3 },
    { value: 0.0029, step: 0.001, min: 0, expected: 0.003 },
  ])('snaps $value to the step grid', ({ value, step, min, expected }) => {
    expect(snapToStep(value, step, min)).toBe(expected);
  });

  it('returns the value unchanged for non-positive steps', () => {
    expect(snapToStep(0.123_456, 0)).toBe(0.123_456);
    expect(snapToStep(0.5, -1)).toBe(0.5);
  });
});

describe('SliderInput', () => {
  it('owns the shared outline and cursor states', () => {
    const { container, rerender } = renderSlider({ className: 'cursor-pointer ring-0' });
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;

    expect(root).toHaveClass('ring-1', 'ring-border/50', 'ring-inset', 'cursor-col-resize', 'hover:ring-border');
    expect(root).not.toHaveClass('cursor-pointer', 'ring-0');

    rerender(<SliderInput {...defaultProperties} isReadOnly />);
    expect(root).toHaveClass('cursor-default');
    expect(root).not.toHaveClass('cursor-col-resize', 'hover:ring-border');

    rerender(<SliderInput {...defaultProperties} disabled />);
    expect(root).toHaveClass('cursor-not-allowed');
    expect(root).not.toHaveClass('cursor-col-resize', 'cursor-default', 'hover:ring-border');
  });

  it('renders the controlled display, slots, accessible input, and proportional fill', () => {
    const { container } = renderSlider({
      displayValue: '50.0',
      leadingContent: <span>Leading</span>,
      trailingAdornment: <span>%</span>,
    });

    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('50.0');
    expect(screen.getByText('Leading')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('[data-slot="slider-input-fill"]')).toHaveStyle({ width: '50%' });
  });

  it('clamps fill width and handles a zero-width range', () => {
    const { container, rerender } = renderSlider({ value: -20 });
    const fill = container.querySelector<HTMLElement>('[data-slot="slider-input-fill"]');
    expect(fill).toHaveStyle({ width: '0%' });

    rerender(<SliderInput {...defaultProperties} value={120} />);
    expect(fill).toHaveStyle({ width: '100%' });

    rerender(<SliderInput {...defaultProperties} value={50} min={50} max={50} />);
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('focuses and selects the text after a click below the drag threshold', () => {
    const { container } = renderSlider();
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Amount' });
    setSliderWidth(root);

    fireSliderPointerEvent(root, 'pointerdown', { clientX: 20, pointerId: 1 });
    fireSliderPointerEvent(root, 'pointermove', { clientX: 23, pointerId: 1 });
    fireSliderPointerEvent(root, 'pointerup', { clientX: 23, pointerId: 1 });

    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);
  });

  it('enters editing through Tab while keeping leading and trailing content visible', async () => {
    const user = userEvent.setup();
    renderSlider({ leadingContent: <span>Opacity</span>, trailingAdornment: <span>%</span> });
    const input = screen.getByRole('textbox', { name: 'Amount' });

    await user.tab();

    expect(input).toHaveFocus();
    expect(input).toHaveClass('opacity-100');
    expect(screen.getByText('Opacity')).toBeVisible();
    expect(screen.getByText('%')).toBeVisible();
  });

  it('reports raw text and commits finite edited values on Enter', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    const onInputCommit = vi.fn();
    const onFocusChange = vi.fn();
    renderSlider({ onInputChange, onInputCommit, onFocusChange });
    const input = screen.getByRole('textbox', { name: 'Amount' });

    await user.click(input);
    await user.clear(input);
    await user.type(input, '42');
    await user.keyboard('{Enter}');

    expect(onInputChange).toHaveBeenLastCalledWith('42');
    expect(onInputCommit).toHaveBeenCalledWith(42);
    expect(onFocusChange).toHaveBeenNthCalledWith(1, true);
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
    expect(input).not.toHaveFocus();
  });

  it('restores empty text and does not commit it on blur', async () => {
    const user = userEvent.setup();
    const onInputCommit = vi.fn();
    renderSlider({ onInputCommit });
    const input = screen.getByRole('textbox', { name: 'Amount' });

    await user.click(input);
    await user.clear(input);
    await user.tab();

    expect(input).toHaveValue('50');
    expect(onInputCommit).not.toHaveBeenCalled();
  });

  it('reverts to the pre-edit value on Escape', async () => {
    const user = userEvent.setup();
    const onInputCommit = vi.fn();
    renderSlider({ onInputCommit });
    const input = screen.getByRole('textbox', { name: 'Amount' });

    await user.click(input);
    await user.clear(input);
    await user.type(input, '90');
    await user.keyboard('{Escape}');

    expect(input).toHaveValue('50');
    expect(onInputCommit).toHaveBeenLastCalledWith(50);
    expect(input).not.toHaveFocus();
  });

  it('syncs idle controlled values without overwriting active user text', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSlider();
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Amount' });

    rerender(<SliderInput {...defaultProperties} value={60} />);
    expect(input).toHaveValue('60');

    await user.click(input);
    await user.clear(input);
    await user.type(input, '77');
    rerender(<SliderInput {...defaultProperties} value={80} />);
    expect(input).toHaveValue('77');

    await user.tab();
    expect(input).toHaveValue('80');
  });

  it('does not schedule a passive follow-up commit for an idle controlled value update', () => {
    let commitCount = 0;
    const onRender = (): void => {
      commitCount += 1;
    };
    const { rerender } = render(
      <Profiler id='slider-input' onRender={onRender}>
        <SliderInput {...defaultProperties} />
      </Profiler>,
    );
    const initialCommitCount = commitCount;

    rerender(
      <Profiler id='slider-input' onRender={onRender}>
        <SliderInput {...defaultProperties} value={60} />
      </Profiler>,
    );

    expect(commitCount - initialCommitCount).toBe(1);
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('60');
  });

  it('starts scrubbing only beyond the threshold and commits once on release', () => {
    const onScrubChange = vi.fn();
    const onScrubCommit = vi.fn();
    const { container } = renderSlider({ onScrubChange, onScrubCommit });
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
    setSliderWidth(root);

    fireSliderPointerEvent(root, 'pointerdown', { clientX: 10, pointerId: 1 });
    fireSliderPointerEvent(root, 'pointermove', { clientX: 13, pointerId: 1 });
    expect(onScrubChange).not.toHaveBeenCalled();

    fireSliderPointerEvent(root, 'pointermove', { clientX: 24, pointerId: 1 });
    fireSliderPointerEvent(root, 'pointerup', { clientX: 24, pointerId: 1 });

    expect(onScrubChange).toHaveBeenLastCalledWith(64);
    expect(onScrubCommit).toHaveBeenCalledOnce();
    expect(onScrubCommit).toHaveBeenCalledWith(64);
  });

  it('supports a scrub beginning at clientX zero, min-anchored snapping, and range clamping', () => {
    const onScrubChange = vi.fn();
    const { container } = renderSlider({ value: 0.05, min: 0.05, max: 1.05, step: 0.1, onScrubChange });
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
    setSliderWidth(root);

    scrub(root, { startX: 0, endX: 16 });
    expect(onScrubChange).toHaveBeenLastCalledWith(0.25);

    fireSliderPointerEvent(root, 'pointermove', { clientX: 200, pointerId: 1 });
    expect(onScrubChange).toHaveBeenLastCalledWith(1.05);
  });

  it('ignores non-initiating pointers', () => {
    const onScrubChange = vi.fn();
    const onScrubCommit = vi.fn();
    const { container } = renderSlider({ onScrubChange, onScrubCommit });
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
    setSliderWidth(root);

    fireSliderPointerEvent(root, 'pointerdown', { clientX: 0, pointerId: 1 });
    fireSliderPointerEvent(root, 'pointermove', { clientX: 40, pointerId: 2 });
    fireSliderPointerEvent(root, 'pointerup', { clientX: 40, pointerId: 2 });

    expect(onScrubChange).not.toHaveBeenCalled();
    expect(onScrubCommit).not.toHaveBeenCalled();
  });

  it('commits the last accepted scrub value and clears interaction on pointer cancel', () => {
    const onScrubChange = vi.fn();
    const onScrubCommit = vi.fn();
    const { container } = renderSlider({ onScrubChange, onScrubCommit });
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
    setSliderWidth(root);

    scrub(root, { startX: 0, endX: 25 });
    fireSliderPointerEvent(root, 'pointercancel', { clientX: 25, pointerId: 1 });
    fireSliderPointerEvent(root, 'pointermove', { clientX: 50, pointerId: 1 });

    expect(onScrubChange).toHaveBeenCalledOnce();
    expect(onScrubCommit).toHaveBeenCalledWith(75);
  });

  it('steps and clamps Arrow keys without leaking consumed keys to a parent', () => {
    const onInputCommit = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <div onKeyDown={onParentKeyDown}>
        <SliderInput {...defaultProperties} value={99} onInputCommit={onInputCommit} />
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Amount' });
    act(() => {
      input.focus();
    });

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onInputCommit).toHaveBeenLastCalledWith(100);
    expect(onParentKeyDown).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'a' });
    expect(onParentKeyDown).toHaveBeenCalledOnce();
  });

  it('disables editing, scrubbing, keyboard mutation, and callbacks', async () => {
    const user = userEvent.setup();
    const onScrubChange = vi.fn();
    const onInputChange = vi.fn();
    const onInputCommit = vi.fn();
    const { container } = renderSlider({ disabled: true, onScrubChange, onInputChange, onInputCommit });
    const root = container.querySelector<HTMLElement>('[data-slot="slider-input"]')!;
    const input = screen.getByRole('textbox', { name: 'Amount' });
    setSliderWidth(root);

    scrub(root);
    fireSliderPointerEvent(root, 'pointerup', { clientX: 25, pointerId: 1 });
    await user.type(input, '2');
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(input).toBeDisabled();
    expect(input).not.toHaveFocus();
    expect(onScrubChange).not.toHaveBeenCalled();
    expect(onInputChange).not.toHaveBeenCalled();
    expect(onInputCommit).not.toHaveBeenCalled();
  });
});
