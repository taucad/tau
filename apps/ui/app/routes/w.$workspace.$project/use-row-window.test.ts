// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { rowWindowThreshold, useRowWindow } from '#routes/w.$workspace.$project/use-row-window.js';

const rectAt = (top: number): DOMRect => ({
  top,
  bottom: top,
  left: 0,
  right: 0,
  x: 0,
  y: top,
  width: 0,
  height: 0,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- DOMRect's own method name.
  toJSON: () => ({}),
});

/** A scrolling parent 280px tall holding the row container at its top. */
const scrollingList = (): { parent: HTMLDivElement; container: HTMLDivElement } => {
  const parent = document.createElement('div');
  parent.style.overflowY = 'auto';
  Object.defineProperty(parent, 'clientHeight', { value: 280 });
  const container = document.createElement('div');
  parent.append(container);
  document.body.append(parent);
  container.getBoundingClientRect = () => rectAt(-parent.scrollTop);
  parent.getBoundingClientRect = () => rectAt(0);
  return { parent, container };
};

describe('useRowWindow', () => {
  it('renders every row of a short list', () => {
    const { container } = scrollingList();
    const { result } = renderHook(() => useRowWindow(container, rowWindowThreshold));
    expect(result.current).toMatchObject({ windowed: false, start: 0, end: rowWindowThreshold, topSpace: 0 });
  });

  it('renders the viewport plus overscan of a long list and follows the scroll', () => {
    const { parent, container } = scrollingList();
    const { result } = renderHook(() => useRowWindow(container, 10_000));
    /* 280px at the 28px fallback row height is 10 rows, with 20 rows of overscan on each side. */
    expect(result.current).toMatchObject({ windowed: true, start: 0, end: 50, topSpace: 0 });
    expect(result.current.bottomSpace).toBe((10_000 - 50) * 28);

    act(() => {
      parent.scrollTop = 28 * 5000;
      parent.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toMatchObject({ start: 4980, end: 5030, topSpace: 4980 * 28 });
  });

  it('scrolls a row outside the window into it', () => {
    const { parent, container } = scrollingList();
    const { result } = renderHook(() => useRowWindow(container, 10_000));

    act(() => {
      result.current.scrollToIndex(9000);
    });

    expect(parent.scrollTop).toBe(9000 * 28 - 140);
    expect(result.current.start).toBeLessThanOrEqual(9000);
    expect(result.current.end).toBeGreaterThan(9000);
  });
});
