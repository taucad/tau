import { useMemo } from 'react';

/**
 * Configuration for a single toolbar item.
 * Items are ordered by "stickiness" -- the first item in the array
 * is the last to overflow, and the last item overflows first.
 */
export type ToolbarItemConfig = {
  /** Unique identifier for this item */
  readonly id: string;
  /** Approximate width in px when rendered inline */
  readonly width: number;
  /** Optional compact width for compressible items (e.g. FOV slider) */
  readonly compactWidth?: number;
};

type ToolbarOverflowOptions = {
  /** Gap between items in px (e.g. gap-2 = 8px). @default 8 */
  readonly gap?: number;
  /** Width reserved for always-visible elements (e.g. settings button + gap). @default 44 */
  readonly reservedWidth?: number;
};

export type ToolbarOverflowResult = {
  /** Set of item IDs that should be rendered inline */
  readonly visibleIds: Set<string>;
  /** Set of item IDs that should overflow into the dropdown */
  readonly overflowIds: Set<string>;
  /** Whether compressible items should use their compact width */
  readonly isCompact: boolean;
};

/**
 * Computes which toolbar items are visible vs overflowed from a measured layout width.
 *
 * Pass a width that represents how much horizontal space the toolbar row is allowed to use
 * (e.g. viewer layout width minus horizontal gutter from ResizeObserver), not the toolbar
 * element's own width — the latter creates a feedback loop once items overflow and the toolbar shrinks.
 *
 * Items are provided ordered by stickiness (first = last to overflow). The algorithm:
 *   1. Try fitting all items at full width
 *   2. Try compacting compressible items
 *   3. Start overflowing items from the end (right-to-left)
 *   4. If nothing fits, overflow everything
 */
export function useToolbarOverflow(
  items: readonly ToolbarItemConfig[],
  availableWidth: number | undefined,
  options?: ToolbarOverflowOptions,
): ToolbarOverflowResult {
  const { gap = 8, reservedWidth = 44 } = options ?? {};

  return useMemo(
    () => computeToolbarOverflow(items, availableWidth, gap, reservedWidth),
    [items, availableWidth, gap, reservedWidth],
  );
}

/**
 * Pure computation extracted for testability.
 *
 * Given toolbar items, the measured layout width, gap, and reserved width,
 * determines which items are visible vs overflowed and whether compact mode is active.
 */
// oxlint-disable-next-line max-params -- pure function with 25+ test call sites; wrapping would add noise for simple numeric args
export function computeToolbarOverflow(
  items: readonly ToolbarItemConfig[],
  containerWidth: number | undefined,
  gap: number,
  reservedWidth: number,
): { visibleIds: Set<string>; overflowIds: Set<string>; isCompact: boolean } {
  // Before first measurement, show everything at full size to avoid flash
  if (containerWidth === undefined) {
    return {
      visibleIds: new Set(items.map((item) => item.id)),
      overflowIds: new Set<string>(),
      isCompact: false,
    };
  }

  const availableWidth = containerWidth - reservedWidth;

  // Calculate total width for a set of items
  const calculateWidth = (itemList: readonly ToolbarItemConfig[], compact: boolean): number => {
    if (itemList.length === 0) {
      return 0;
    }

    let total = 0;
    for (const item of itemList) {
      total += compact && item.compactWidth !== undefined ? item.compactWidth : item.width;
    }

    // Add gaps between items
    total += (itemList.length - 1) * gap;

    return total;
  };

  // Phase 1: Try full-size -- all items visible
  if (calculateWidth(items, false) <= availableWidth) {
    return {
      visibleIds: new Set(items.map((item) => item.id)),
      overflowIds: new Set<string>(),
      isCompact: false,
    };
  }

  // Phase 2: Try compact mode -- all items visible but compressible items shrink
  if (calculateWidth(items, true) <= availableWidth) {
    return {
      visibleIds: new Set(items.map((item) => item.id)),
      overflowIds: new Set<string>(),
      isCompact: true,
    };
  }

  // Phase 3: Start overflowing items from the end (right-to-left)
  // Keep compact mode active while overflowing
  const visible = [...items];
  const overflow: string[] = [];

  while (visible.length > 0) {
    if (calculateWidth(visible, true) <= availableWidth) {
      break;
    }

    // Remove the last item (rightmost = lowest stickiness)
    const removed = visible.pop()!;
    overflow.push(removed.id);
  }

  return {
    visibleIds: new Set(visible.map((item) => item.id)),
    overflowIds: new Set(overflow),
    isCompact: true,
  };
}
