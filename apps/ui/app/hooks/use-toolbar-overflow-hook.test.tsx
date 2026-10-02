import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useToolbarOverflow } from '#hooks/use-toolbar-overflow.js';
import type { ToolbarItemConfig } from '#hooks/use-toolbar-overflow.js';

/** Mirrors the real viewer control items from chat-viewer-controls.tsx (3D). */
const viewerItems: ToolbarItemConfig[] = [
  { id: 'fov', width: 200, compactWidth: 120 },
  { id: 'grid', width: 32 },
  { id: 'section', width: 32 },
  { id: 'measure', width: 32 },
  { id: 'reset', width: 32 },
  { id: 'capture', width: 32 },
];

const gap = 8;
const reservedWidth = 40;
const options = { gap, reservedWidth } as const;

// Full 6 items: fov(200)+5×32+5×gap(8) = 400; available ≥ 400 → container ≥ 440
// Compact 6: fov(120)+5×32+5×8 = 320; available ≥ 320 → container ≥ 360

function idsArray(s: Set<string>): string[] {
  return [...s].sort();
}

describe('useToolbarOverflow', () => {
  it('before measurement (undefined width): all items visible, not compact', () => {
    const { result } = renderHook(() => useToolbarOverflow(viewerItems, undefined, options));

    expect(idsArray(result.current.visibleIds)).toEqual(['capture', 'fov', 'grid', 'measure', 'reset', 'section']);
    expect(result.current.overflowIds.size).toBe(0);
    expect(result.current.isCompact).toBe(false);
  });

  it('wide budget: all items inline at full size', () => {
    const { result } = renderHook(() => useToolbarOverflow(viewerItems, 500, options));

    expect(idsArray(result.current.visibleIds)).toEqual(['capture', 'fov', 'grid', 'measure', 'reset', 'section']);
    expect(result.current.overflowIds.size).toBe(0);
    expect(result.current.isCompact).toBe(false);
  });

  it('mid budget: all items inline in compact mode', () => {
    const { result } = renderHook(() => useToolbarOverflow(viewerItems, 380, options));

    expect(idsArray(result.current.visibleIds)).toEqual(['capture', 'fov', 'grid', 'measure', 'reset', 'section']);
    expect(result.current.overflowIds.size).toBe(0);
    expect(result.current.isCompact).toBe(true);
  });

  it('narrow budget: rightmost items overflow first', () => {
    const { result } = renderHook(() => useToolbarOverflow(viewerItems, 200, options));

    expect(result.current.visibleIds.has('fov')).toBe(true);
    expect(result.current.visibleIds.has('grid')).toBe(true);
    expect(result.current.overflowIds.has('reset')).toBe(true);
    expect(result.current.overflowIds.has('measure')).toBe(true);
    expect(result.current.overflowIds.has('section')).toBe(true);
    expect(result.current.overflowIds.has('capture')).toBe(true);
    expect(result.current.isCompact).toBe(true);
  });

  it('very narrow budget: everything overflows', () => {
    const { result } = renderHook(() => useToolbarOverflow(viewerItems, 50, options));

    expect(result.current.visibleIds.size).toBe(0);
    expect(idsArray(result.current.overflowIds)).toEqual(['capture', 'fov', 'grid', 'measure', 'reset', 'section']);
    expect(result.current.isCompact).toBe(true);
  });

  it('regression: widening restores items that had overflowed', () => {
    const { result, rerender } = renderHook(
      ({ width }: { readonly width: number | undefined }) => useToolbarOverflow(viewerItems, width, options),
      { initialProps: { width: 200 as number | undefined } },
    );

    expect(result.current.overflowIds.size).toBeGreaterThan(0);

    rerender({ width: 500 });

    expect(idsArray(result.current.visibleIds)).toEqual(['capture', 'fov', 'grid', 'measure', 'reset', 'section']);
    expect(result.current.overflowIds.size).toBe(0);
    expect(result.current.isCompact).toBe(false);
  });

  it('regression: narrowing after wide overflows items again', () => {
    const { result, rerender } = renderHook(
      ({ width }: { readonly width: number | undefined }) => useToolbarOverflow(viewerItems, width, options),
      { initialProps: { width: 500 as number | undefined } },
    );

    expect(result.current.overflowIds.size).toBe(0);

    rerender({ width: 200 });

    expect(result.current.overflowIds.size).toBeGreaterThan(0);
    expect(result.current.isCompact).toBe(true);
  });
});
