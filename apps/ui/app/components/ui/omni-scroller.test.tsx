import { render, screen } from '@testing-library/react';
import type { RefCallback } from 'react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OmniScroller } from '#components/ui/omni-scroller.js';

const setHorizontalOverflow = (
  element: HTMLElement,
  { clientWidth = 100, scrollLeft = 0, scrollWidth = 300 } = {},
): void => {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollLeft: { configurable: true, value: scrollLeft, writable: true },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
};

const wheel = (target: Element, options: WheelEventInit): WheelEvent => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
};

describe('OmniScroller', () => {
  it('should render direct mode defaults while forwarding attributes and the ref', () => {
    const ref = createRef<HTMLDivElement>();

    render(<OmniScroller ref={ref} aria-label='Files' className='snap-x' />);

    expect(screen.getByLabelText('Files')).toBe(ref.current);
    expect(ref.current).toHaveAttribute('data-slot', 'omni-scroller');
    expect(ref.current).toHaveClass(
      'scroll-auto',
      'overflow-x-auto',
      'overflow-y-hidden',
      'overscroll-x-contain',
      '[transform:translate3d(0,0,0)]',
      '[will-change:scroll-position]',
      'snap-x',
    );
  });

  it('should keep a stable callback ref attached until its identity changes or the scroller unmounts', () => {
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const firstRef = vi.fn<RefCallback<HTMLDivElement>>((element) => (element === null ? undefined : firstCleanup));
    const secondRef = vi.fn<RefCallback<HTMLDivElement>>((element) => (element === null ? undefined : secondCleanup));
    const { rerender, unmount } = render(<OmniScroller ref={firstRef} aria-label='Files' />);
    const scroller = screen.getByLabelText('Files');

    expect(firstRef).toHaveBeenCalledOnce();
    expect(firstRef).toHaveBeenCalledWith(scroller);
    rerender(<OmniScroller ref={firstRef} aria-label='Files' className='snap-x' />);
    expect(screen.getByLabelText('Files')).toBe(scroller);
    expect(firstRef).toHaveBeenCalledOnce();
    expect(firstCleanup).not.toHaveBeenCalled();

    rerender(<OmniScroller ref={secondRef} aria-label='Files' className='snap-x' />);
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondRef).toHaveBeenCalledOnce();
    expect(secondRef).toHaveBeenCalledWith(scroller);
    unmount();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });

  it('should translate vertically dominant wheel input in direct mode', () => {
    render(<OmniScroller aria-label='Files' />);
    const viewport = screen.getByLabelText('Files');
    setHorizontalOverflow(viewport, { scrollLeft: 25 });

    const event = wheel(viewport, { deltaX: 10, deltaY: 60 });

    expect(viewport.scrollLeft).toBe(85);
    expect(event.defaultPrevented).toBe(true);
  });

  it('should clamp movement and release vertical scrolling at either boundary', () => {
    render(<OmniScroller aria-label='Files' />);
    const viewport = screen.getByLabelText('Files');
    setHorizontalOverflow(viewport, { scrollLeft: 175 });

    const clamped = wheel(viewport, { deltaY: 50 });
    expect(viewport.scrollLeft).toBe(200);
    expect(clamped.defaultPrevented).toBe(true);

    const endBoundary = wheel(viewport, { deltaY: 50 });
    expect(viewport.scrollLeft).toBe(200);
    expect(endBoundary.defaultPrevented).toBe(false);

    viewport.scrollLeft = 0;
    const startBoundary = wheel(viewport, { deltaY: -50 });
    expect(viewport.scrollLeft).toBe(0);
    expect(startBoundary.defaultPrevented).toBe(false);
  });

  it('should leave horizontal gestures and non-overflowing content native', () => {
    render(<OmniScroller aria-label='Files' />);
    const viewport = screen.getByLabelText('Files');
    setHorizontalOverflow(viewport);

    const horizontal = wheel(viewport, { deltaX: 50, deltaY: 20 });
    expect(viewport.scrollLeft).toBe(0);
    expect(horizontal.defaultPrevented).toBe(false);

    setHorizontalOverflow(viewport, { clientWidth: 300, scrollWidth: 300 });
    const noOverflow = wheel(viewport, { deltaY: 50 });
    expect(viewport.scrollLeft).toBe(0);
    expect(noOverflow.defaultPrevented).toBe(false);
  });

  it('should respect an already-prevented wheel event', () => {
    render(<OmniScroller aria-label='Files' />);
    const viewport = screen.getByLabelText('Files');
    setHorizontalOverflow(viewport);
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 50 });
    event.preventDefault();

    viewport.dispatchEvent(event);

    expect(viewport.scrollLeft).toBe(0);
  });

  it('should resolve the delegated viewport containing the event target', () => {
    render(
      <OmniScroller aria-label='Dockview' viewportSelector='.tabs'>
        <div className='tabs' data-testid='first-tabs'>
          <button type='button'>First tab</button>
        </div>
        <div className='tabs' data-testid='second-tabs'>
          <button type='button'>Second tab</button>
        </div>
      </OmniScroller>,
    );
    const root = screen.getByLabelText('Dockview');
    const first = screen.getByTestId('first-tabs');
    const second = screen.getByTestId('second-tabs');
    setHorizontalOverflow(first);
    setHorizontalOverflow(second, { scrollLeft: 20 });

    const event = wheel(screen.getByRole('button', { name: 'Second tab' }), { deltaY: 50 });

    expect(root).not.toHaveClass(
      'scroll-auto',
      'overflow-x-auto',
      'overflow-y-hidden',
      'overscroll-x-contain',
      '[transform:translate3d(0,0,0)]',
      '[will-change:scroll-position]',
    );
    expect(first.scrollLeft).toBe(0);
    expect(second.scrollLeft).toBe(70);
    expect(event.defaultPrevented).toBe(true);
  });

  it('should ignore delegated events outside a matching viewport', () => {
    render(
      <OmniScroller aria-label='Dockview' viewportSelector='.tabs'>
        <button type='button'>Add tab</button>
      </OmniScroller>,
    );

    const event = wheel(screen.getByRole('button', { name: 'Add tab' }), { deltaY: 50 });

    expect(event.defaultPrevented).toBe(false);
  });

  it('should remove the wheel listener on cleanup', () => {
    const { unmount } = render(<OmniScroller aria-label='Files' />);
    const viewport = screen.getByLabelText('Files');
    setHorizontalOverflow(viewport);

    unmount();
    const event = wheel(viewport, { deltaY: 50 });

    expect(viewport.scrollLeft).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });
});
