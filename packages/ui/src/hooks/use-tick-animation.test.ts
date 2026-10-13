import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTickAnimation } from '#hooks/use-tick-animation.js';

describe('useTickAnimation', () => {
  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start unticked', () => {
      const { result } = renderHook(() => useTickAnimation());

      expect(result.current.ticked).toBe(false);
    });
  });

  // ── Trigger ───────────────────────────────────────────────────────────────

  describe('trigger', () => {
    it('should set ticked to true when triggered', () => {
      const { result } = renderHook(() => useTickAnimation());

      act(() => {
        result.current.trigger();
      });

      expect(result.current.ticked).toBe(true);
    });

    it('should auto-reset ticked to false after the default duration', () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTickAnimation());

        act(() => {
          result.current.trigger();
        });
        expect(result.current.ticked).toBe(true);

        act(() => {
          vi.advanceTimersByTime(2000);
        });
        expect(result.current.ticked).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should respect a custom duration', () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTickAnimation(500));

        act(() => {
          result.current.trigger();
        });

        act(() => {
          vi.advanceTimersByTime(499);
        });
        expect(result.current.ticked).toBe(true);

        act(() => {
          vi.advanceTimersByTime(1);
        });
        expect(result.current.ticked).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should remain ticked until the full duration elapses', () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTickAnimation());

        act(() => {
          result.current.trigger();
        });

        act(() => {
          vi.advanceTimersByTime(1999);
        });
        expect(result.current.ticked).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not restart the timer when triggered while already ticked', () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTickAnimation(1000));

        act(() => {
          result.current.trigger();
        });

        act(() => {
          vi.advanceTimersByTime(800);
        });
        expect(result.current.ticked).toBe(true);

        act(() => {
          result.current.trigger();
        });

        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(result.current.ticked).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('should clear the pending timer on unmount', () => {
      vi.useFakeTimers();
      try {
        const { result, unmount } = renderHook(() => useTickAnimation());

        act(() => {
          result.current.trigger();
        });

        unmount();

        act(() => {
          vi.advanceTimersByTime(5000);
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── Return value stability ────────────────────────────────────────────────

  describe('return value stability', () => {
    it('should return a stable trigger function across rerenders', () => {
      const { result, rerender } = renderHook(() => useTickAnimation());

      const first = result.current.trigger;
      rerender();

      expect(result.current.trigger).toBe(first);
    });
  });
});
