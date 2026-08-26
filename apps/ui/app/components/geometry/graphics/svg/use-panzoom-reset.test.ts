import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PanzoomObject, PanzoomOptions } from '@panzoom/panzoom';
import { usePanzoomReset } from '#components/geometry/graphics/svg/use-panzoom-reset.js';

// ── Controllable mocks ───────────────────────────────────────────────────────

const mockUnsubscribe = vi.fn();
const mockOn = vi.fn(() => ({ unsubscribe: mockUnsubscribe }));
const mockGraphicsActor = { on: mockOn };

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => mockGraphicsActor,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockPanzoomInstance(): PanzoomObject {
  return {
    zoomToPoint: vi.fn(),
    pan: vi.fn(),
    getScale: vi.fn(() => 1),
    getPan: vi.fn(() => ({ x: 0, y: 0 })),
    getOptions: vi.fn(() => ({}) satisfies PanzoomOptions),
    bind: vi.fn(),
    destroy: vi.fn(),
    eventNames: { down: 'pointerdown', move: 'pointermove', up: 'pointerup' },
    handleDown: vi.fn(),
    handleMove: vi.fn(),
    handleUp: vi.fn(),
    zoom: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomWithWheel: vi.fn(),
    reset: vi.fn(),
    resetStyle: vi.fn(),
    setOptions: vi.fn(),
    setStyle: vi.fn(),
  };
}

function createMockContainer(rect: Partial<DOMRect> = {}): HTMLDivElement {
  const div = document.createElement('div');
  vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mock
    toJSON: vi.fn(),
    ...rect,
  });
  return div;
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockOn.mockClear();
  mockUnsubscribe.mockClear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('usePanzoomReset', () => {
  // ── Registration ─────────────────────────────────────────────────────────

  describe('registration', () => {
    it('subscribes to the renderer-neutral reset event on mount', () => {
      const panzoomRef = { current: createMockPanzoomInstance() };
      const containerRef = { current: createMockContainer() };

      renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      expect(mockOn).toHaveBeenCalledTimes(1);
      expect(mockOn).toHaveBeenCalledWith(
        'viewResetRequested',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns AsymmetricMatcher typed as any
        expect.any(Function),
      );
    });

    it('only registers once across rerenders', () => {
      const panzoomRef = { current: createMockPanzoomInstance() };
      const containerRef = { current: createMockContainer() };

      const { rerender } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      rerender();
      rerender();

      expect(mockOn).toHaveBeenCalledTimes(1);
    });
  });

  // ── Reset behaviour ──────────────────────────────────────────────────────

  describe('reset behaviour', () => {
    it('calls zoomToPoint with scale 1 and viewport center', () => {
      const panzoomInstance = createMockPanzoomInstance();
      const panzoomRef = { current: panzoomInstance };
      const containerRef = { current: createMockContainer({ left: 100, top: 50, width: 800, height: 600 }) };

      const { result } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      act(() => {
        result.current();
      });

      expect(panzoomInstance.zoomToPoint).toHaveBeenCalledWith(1, {
        clientX: 100 + 800 / 2,
        clientY: 50 + 600 / 2,
      });
    });

    it('calls pan with (0, 0) and animate: false to avoid CSS transition race', () => {
      const panzoomInstance = createMockPanzoomInstance();
      const panzoomRef = { current: panzoomInstance };
      const containerRef = { current: createMockContainer() };

      const { result } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      act(() => {
        result.current();
      });

      expect(panzoomInstance.pan).toHaveBeenCalledWith(0, 0, { animate: false });
    });

    it('does not use animate: true for pan (guards against CSS transition race condition)', () => {
      const panzoomInstance = createMockPanzoomInstance();
      const panzoomRef = { current: panzoomInstance };
      const containerRef = { current: createMockContainer() };

      const { result } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      act(() => {
        result.current();
      });

      const panCalls = (panzoomInstance.pan as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of panCalls) {
        const options = call[2] as { animate?: boolean } | undefined;
        expect(options?.animate).not.toBe(true);
      }
    });
  });

  // ── Guard clauses ────────────────────────────────────────────────────────

  describe('guard clauses', () => {
    it('does nothing when panzoomRef is null', () => {
      const panzoomRef = { current: null };
      const containerRef = { current: createMockContainer() };

      const { result } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      act(() => {
        result.current();
      });

      // No errors thrown, just returns early
    });

    it('does nothing when containerRef is null', () => {
      const panzoomInstance = createMockPanzoomInstance();
      const panzoomRef = { current: panzoomInstance };
      const containerRef = { current: null };

      const { result } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      act(() => {
        result.current();
      });

      expect(panzoomInstance.zoomToPoint).not.toHaveBeenCalled();
      expect(panzoomInstance.pan).not.toHaveBeenCalled();
    });

    it('does nothing when both refs are null', () => {
      const panzoomRef = { current: null };
      const containerRef = { current: null };

      const { result } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      act(() => {
        result.current();
      });

      // No errors thrown
    });
  });

  // ── Return value ─────────────────────────────────────────────────────────

  describe('return value', () => {
    it('returns a stable reset function across rerenders', () => {
      const panzoomRef = { current: createMockPanzoomInstance() };
      const containerRef = { current: createMockContainer() };

      const { result, rerender } = renderHook(() => usePanzoomReset({ panzoomRef, containerRef }));

      const firstReset = result.current;
      rerender();
      const secondReset = result.current;

      expect(firstReset).toBe(secondReset);
    });
  });
});
