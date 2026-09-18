import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { useIsIntersecting } from '#components/geometry/loader/metal-morph-playback-gates.js';

const observers: Array<{ callback: IntersectionObserverCallback; element?: Element }> = [];

const entryFor = (isIntersecting: boolean, target: Element): IntersectionObserverEntry => {
  const rect = target.getBoundingClientRect();
  return {
    boundingClientRect: rect,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: rect,
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
};

describe('useIsIntersecting', () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
        public readonly callback: IntersectionObserverCallback;
        public constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        public observe(element: Element): void {
          observers.push({ callback: this.callback, element });
        }
        public disconnect(): void {
          observers.length = 0;
        }
        public unobserve(): void {
          // No per-element bookkeeping is needed.
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should take the newest entry when the observer delivers several at once', () => {
    const element = document.createElement('div');
    const { result } = renderHook(() => useIsIntersecting(element));
    const observer = observers[0];
    expect(observer).toBeDefined();

    // A surface that left the viewport and came back before the observer's task ran reports both changes
    // together, oldest first; the newest is the truth, and reading the oldest would hold it offscreen.
    act(() => {
      observer!.callback([entryFor(false, element), entryFor(true, element)], mock<IntersectionObserver>());
    });
    expect(result.current).toBe(true);

    act(() => {
      observer!.callback([entryFor(true, element), entryFor(false, element)], mock<IntersectionObserver>());
    });
    expect(result.current).toBe(false);
  });
});
