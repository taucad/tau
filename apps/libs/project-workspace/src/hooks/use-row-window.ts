import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Below this many visible rows every row renders; windowing only pays off for long lists. */
export const rowWindowThreshold = 200;
/** Rows rendered beyond each edge of the viewport, so a fast scroll never shows a gap. */
const overscanRows = 20;
/** Used until a rendered row is measured. */
const fallbackRowHeight = 28;

/** One slot of a windowed list, in order: a row to render, or the space standing in for rows that are not. @public */
export type RowSlot =
  | Readonly<{ kind: 'row'; index: number }>
  | Readonly<{ kind: 'space'; from: number; height: number }>;

/** The window of rows to render, as half-open indices into the visible row list. @public */
export type RowWindow = Readonly<{
  /** Whether the list is windowed at all; when false every row renders. */
  windowed: boolean;
  start: number;
  end: number;
  /** Height of the space standing in for the rows above `start`. */
  topSpace: number;
  /** Height of the space standing in for the rows at or after `end`. */
  bottomSpace: number;
  /**
   * What to render, in order: every row of the window, every pinned row
   * outside it, and a space for each run of rows between them.
   */
  slots: readonly RowSlot[];
  /** Ref for one rendered row, from which the row height is measured. */
  // oxlint-disable-next-line typescript/no-restricted-types -- React hands a ref callback null on detach.
  measureRow: (element: HTMLElement | null) => void;
  /** Scroll the nearest scrolling ancestor so the row at `index` renders and is in view. */
  scrollToIndex: (index: number) => void;
}>;

const scrollParentOf = (element: HTMLElement): HTMLElement | undefined => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
  }
  return undefined;
};

type Range = Readonly<{ start: number; end: number }>;

/**
 * Render only the rows of a long list that its scrolling ancestor shows
 * (charter D18): a directory with thousands of children costs the DOM a
 * viewport of rows, not one per child. Rows are assumed one height, measured
 * from a rendered row the caller marks as plain (no inline input beneath it).
 *
 * Pinned rows render wherever they are: the focused row, so focus and the
 * arrow keys survive a scroll that moves it out of the window, and a row
 * being renamed or holding an inline input, so typing is never lost.
 *
 * @param container - The element the rows render into.
 * @param count - Number of rows in the list.
 * @param pinned - Rows that render even outside the window.
 * @returns The window to render.
 * @public
 */
export function useRowWindow(
  container: HTMLElement | undefined,
  count: number,
  pinned: readonly number[] = [],
): RowWindow {
  const windowed = count > rowWindowThreshold;
  const [rowHeight, setRowHeight] = useState(fallbackRowHeight);
  const [range, setRange] = useState<Range>({ start: 0, end: Math.min(count, rowWindowThreshold) });
  const parentRef = useRef<HTMLElement | undefined>(undefined);

  const offsetWithin = useCallback((parent: HTMLElement, element: HTMLElement): number => {
    return element.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop;
  }, []);

  const update = useCallback(() => {
    const parent = parentRef.current;
    if (!windowed) {
      return;
    }
    if (!container || !parent) {
      /* Nothing scrolls the list (not laid out yet, or no scrolling ancestor): show its head. */
      const end = Math.min(count, rowWindowThreshold);
      setRange((previous) => (previous.start === 0 && previous.end === end ? previous : { start: 0, end }));
      return;
    }
    const height = rowHeight;
    const top = parent.scrollTop - offsetWithin(parent, container);
    const first = Math.max(0, Math.floor(top / height) - overscanRows);
    const visible = Math.ceil(parent.clientHeight / height);
    const start = Math.min(first, Math.max(0, count - 1));
    const end = Math.min(count, start + visible + 2 * overscanRows);
    setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
  }, [container, count, offsetWithin, rowHeight, windowed]);

  useLayoutEffect(() => {
    if (!windowed || !container) {
      parentRef.current = undefined;
      return undefined;
    }
    const parent = scrollParentOf(container);
    parentRef.current = parent;
    if (!parent) {
      return undefined;
    }
    update();
    parent.addEventListener('scroll', update, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    resize?.observe(parent);
    return () => {
      parent.removeEventListener('scroll', update);
      resize?.disconnect();
    };
  }, [container, update, windowed]);

  /* `update` changes with `count`, so a new row count re-measures the window. */
  useEffect(() => {
    update();
  }, [update]);

  // oxlint-disable-next-line typescript/no-restricted-types -- React hands a ref callback null on detach.
  const measureRow = useCallback((element: HTMLElement | null) => {
    const height = element?.offsetHeight ?? 0;
    if (height > 0) {
      setRowHeight((previous) => (previous === height ? previous : height));
    }
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      const parent = parentRef.current;
      if (!windowed || !container || !parent || index < 0) {
        return;
      }
      const target = offsetWithin(parent, container) + index * rowHeight;
      if (target < parent.scrollTop || target + rowHeight > parent.scrollTop + parent.clientHeight) {
        parent.scrollTop = Math.max(0, target - parent.clientHeight / 2);
      }
      update();
    },
    [container, offsetWithin, rowHeight, update, windowed],
  );

  if (!windowed) {
    const slots = Array.from({ length: count }, (_, index): RowSlot => ({ kind: 'row', index }));
    return { windowed, start: 0, end: count, topSpace: 0, bottomSpace: 0, slots, measureRow, scrollToIndex };
  }
  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, start), count);
  return {
    windowed,
    start,
    end,
    topSpace: start * rowHeight,
    bottomSpace: (count - end) * rowHeight,
    slots: windowSlots({ start, end, count, pinned, rowHeight }),
    measureRow,
    scrollToIndex,
  };
}

/**
 * The slots of a window with its pinned rows: rows in index order, each run
 * of unrendered rows between them one space of their total height.
 *
 * @param window - The window's bounds, the list length, the pinned rows and the row height.
 * @returns The slots, in order.
 */
const windowSlots = ({
  start,
  end,
  count,
  pinned,
  rowHeight,
}: Readonly<{
  start: number;
  end: number;
  count: number;
  pinned: readonly number[];
  rowHeight: number;
}>): RowSlot[] => {
  const outside = [...new Set(pinned)].filter(
    (index) => index >= 0 && index < count && (index < start || index >= end),
  );
  const rows = [
    ...outside.filter((index) => index < start),
    ...range(start, end),
    ...outside.filter((index) => index >= end),
  ];
  rows.sort((left, right) => left - right);
  const slots: RowSlot[] = [];
  let next = 0;
  for (const index of rows) {
    if (index > next) {
      slots.push({ kind: 'space', from: next, height: (index - next) * rowHeight });
    }
    slots.push({ kind: 'row', index });
    next = index + 1;
  }
  if (count > next) {
    slots.push({ kind: 'space', from: next, height: (count - next) * rowHeight });
  }
  return slots;
};

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from) }, (_, offset) => from + offset);
