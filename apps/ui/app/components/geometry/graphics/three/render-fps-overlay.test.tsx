import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderFpsOverlay } from '#components/geometry/graphics/three/render-fps-overlay.js';
import { renderLoopObservers } from '#components/geometry/graphics/three/render-loop-observer.js';
import { resolveSectionPlanePickerRect } from '#components/geometry/graphics/three/controls/section-plane-picker.js';

const mocks = vi.hoisted(() => ({
  frame: undefined as (() => void) | undefined,
  gl: { domElement: undefined as HTMLCanvasElement | undefined },
  invalidate: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: typeof mocks) => unknown) => select(mocks),
  useFrame: (callback: () => void) => {
    mocks.frame = callback;
  },
}));

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  mocks.invalidate.mockClear();
});

describe('viewport submission FPS output', () => {
  it('should own an accessible non-announcing output without waking demand rendering and remove it on teardown', () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    const canvas = document.createElement('canvas');
    parent.append(canvas);
    document.body.append(parent);
    mocks.gl.domElement = canvas;
    const view = render(<RenderFpsOverlay />);
    const output = screen.getByLabelText('Render-loop submission FPS');
    expect(output).toHaveTextContent('FPS · idle');
    expect(output).toHaveAttribute('aria-live', 'off');
    expect(output).toHaveAttribute('aria-description', expect.stringContaining('does not measure GPU completion'));
    act(() => {
      for (let index = 0; index < 40; index++) {
        vi.advanceTimersByTime(8);
        mocks.frame?.();
      }
    });
    expect(output.textContent).toMatch(/128\.0 FPS/u);
    const observer = renderLoopObservers.get(canvas);
    view.rerender(<RenderFpsOverlay hasTopRightGizmo />);
    const cube = { left: 704, top: 10, size: 96 };
    const sectionPicker = resolveSectionPlanePickerRect(cube);
    expect(cube.top + cube.size).toBeLessThan(112);
    expect(sectionPicker.top + sectionPicker.size).toBeLessThan(112);
    expect(screen.getByLabelText('Render-loop submission FPS')).toHaveClass('top-28', 'right-2');
    expect(screen.getByLabelText('Render-loop submission FPS')).not.toHaveClass('top-2');
    expect(renderLoopObservers.get(canvas)).toBe(observer);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Render-loop submission FPS')).toHaveTextContent('FPS · idle');
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(renderLoopObservers.has(canvas)).toBe(true);
    view.unmount();
    expect(output.isConnected).toBe(false);
    expect(renderLoopObservers.has(canvas)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      mocks.frame?.();
      vi.advanceTimersByTime(1000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
