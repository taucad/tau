import type { DockviewApi, PaneviewApi } from 'dockview-react';
import type { ResizeHandle } from '#components/panes/use-resize-handles.js';

/** Locate the two views adjacent to a native sash, including nested split branches. */
export function adjacentResizeViews(
  sash: HTMLElement,
): { before: HTMLElement; after: HTMLElement; isVertical: boolean; index: number; all: HTMLElement[] } | undefined {
  const split = sash.parentElement?.parentElement;
  const index = [...(sash.parentElement?.children ?? [])].indexOf(sash);
  const views = split?.querySelector(':scope > .dv-view-container, :scope > .split-view-container')?.children;
  const before = views?.[index];
  const after = views?.[index + 1];
  if (!(before instanceof HTMLElement) || !(after instanceof HTMLElement)) {
    return undefined;
  }
  return {
    before,
    after,
    all: [...(views ?? [])].filter((view): view is HTMLElement => view instanceof HTMLElement),
    index,
    isVertical: sash.classList.contains('sash-vertical') || split?.classList.contains('dv-horizontal') === true,
  };
}

/** Keep the adjacent pair's total allocation while respecting both views' constraints. */
export function resizePairBounds(
  value: number,
  total: number,
  limits: { minimum: number; maximum: number; nextMinimum: number; nextMaximum: number },
): { minimum: number; maximum: number; value: number } {
  const { minimum, maximum, nextMinimum, nextMaximum } = limits;
  const lower = Math.max(minimum, total - nextMaximum);
  const upper = Math.min(maximum, total - nextMinimum);
  return { minimum: Math.min(lower, value), maximum: Math.max(upper, value), value };
}

/** Native Dockview sashes redistribute through all siblings, including fixed collapsed sections. */
function splitBounds(
  views: NonNullable<ReturnType<typeof adjacentResizeViews>>,
  limits: ReadonlyArray<{ minimum: number; maximum: number }>,
): { minimum: number; maximum: number; value: number } {
  const axis = views.isVertical ? 'width' : 'height';
  const sizes = views.all.map((view) => view.getBoundingClientRect()[axis]);
  const value = sizes.slice(0, views.index + 1).reduce((sum, size) => sum + size, 0);
  const before = limits.slice(0, views.index + 1);
  const after = limits.slice(views.index + 1);
  return resizePairBounds(
    value,
    sizes.reduce((sum, size) => sum + size, 0),
    {
      minimum: before.reduce((sum, limit) => sum + limit.minimum, 0),
      maximum: before.reduce((sum, limit) => sum + limit.maximum, 0),
      nextMinimum: after.reduce((sum, limit) => sum + limit.minimum, 0),
      nextMaximum: after.reduce((sum, limit) => sum + limit.maximum, 0),
    },
  );
}

/** Use the engine's selected-sash path so nested constraints, proportions and saved layout events survive. */
function resizeNativeSash(sash: HTMLElement, delta: number, isVertical: boolean): void {
  const rect = sash.getBoundingClientRect();
  const start = { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, bubbles: true };
  const { ownerDocument } = sash;
  // Group/panel APIs cannot target arbitrary branch boundaries or redistribute through fixed siblings.
  sash.dispatchEvent(new PointerEvent('pointerdown', start));
  try {
    ownerDocument.dispatchEvent(
      new PointerEvent('pointermove', {
        ...start,
        clientX: start.clientX + (isVertical ? delta : 0),
        clientY: start.clientY + (isVertical ? 0 : delta),
      }),
    );
  } finally {
    ownerDocument.dispatchEvent(new PointerEvent('pointerup', start));
  }
}

/** Named section separators use current native panel constraints, including collapsed allocations. */
export function paneviewResizeHandle(api: PaneviewApi | undefined, sash: HTMLElement): ResizeHandle | undefined {
  const views = adjacentResizeViews(sash);
  if (!api || !views || api.panels.length !== views.all.length) {
    return undefined;
  }
  const bounds = splitBounds(
    views,
    api.panels.map((panel) => ({ minimum: panel.minimumSize, maximum: panel.maximumSize })),
  );
  return {
    label: `Resize ${views.before.querySelector('[data-slot=paneview-header] button')?.textContent.trim() ?? 'previous'} and ${views.after.querySelector('[data-slot=paneview-header] button')?.textContent.trim() ?? 'next'} sections`,
    orientation: 'horizontal',
    ...bounds,
    resize(size) {
      resizeNativeSash(sash, size - bounds.value, false);
    },
  };
}

/** Measure native grid branch constraints: sum parallel children, intersect perpendicular ones. */
function branchBounds(api: DockviewApi, view: HTMLElement, isVertical: boolean): { minimum: number; maximum: number } {
  const split = view.querySelector<HTMLElement>(':scope > .dv-branch-node > .dv-split-view-container');
  if (split) {
    const children = [...(split.querySelector(':scope > .dv-view-container')?.children ?? [])]
      .filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.getBoundingClientRect()[isVertical ? 'width' : 'height'] > 0,
      )
      .map((child) => branchBounds(api, child, isVertical));
    const parallel = split.classList.contains('dv-horizontal') === isVertical;
    return {
      minimum: parallel
        ? children.reduce((sum, child) => sum + child.minimum, 0)
        : Math.max(0, ...children.map((child) => child.minimum)),
      maximum: parallel
        ? children.reduce((sum, child) => sum + child.maximum, 0)
        : Math.min(Number.POSITIVE_INFINITY, ...children.map((child) => child.maximum)),
    };
  }
  const group = api.groups.find((item) => view.contains(item.element));
  return {
    minimum: group ? (isVertical ? group.minimumWidth : group.minimumHeight) : 0,
    maximum: group ? (isVertical ? group.maximumWidth : group.maximumHeight) : Number.POSITIVE_INFINITY,
  };
}

/** Resize the selected native grid sash, including branches deeper than a group's setSize can reach. */
export function dockviewResizeHandle(api: DockviewApi | undefined, sash: HTMLElement): ResizeHandle | undefined {
  const views = adjacentResizeViews(sash);
  if (!api || !views) {
    return undefined;
  }
  const before = api.groups.filter((group) => views.before.contains(group.element));
  const after = api.groups.filter((group) => views.after.contains(group.element));
  if (before.length === 0 || after.length === 0) {
    return undefined;
  }
  const bounds = splitBounds(
    views,
    views.all.map((view) => branchBounds(api, view, views.isVertical)),
  );
  const beforeLabel = before.map((item) => item.activePanel?.title ?? 'Empty pane').join(', ');
  const afterLabel = after.map((item) => item.activePanel?.title ?? 'Empty pane').join(', ');
  return {
    label: `Resize ${beforeLabel} and ${afterLabel} panes`,
    orientation: views.isVertical ? 'vertical' : 'horizontal',
    ...bounds,
    resize(size) {
      resizeNativeSash(sash, size - bounds.value, views.isVertical);
    },
  };
}
