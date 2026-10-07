import { useCallback, useSyncExternalStore } from 'react';
import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';

/** Dockview keeps branch wrappers visible even when every leaf beneath them is hidden. */
function hasVisibleGroup(view: Element): boolean {
  if (view.querySelector(':scope > .dv-groupview')) {
    return true;
  }

  return [
    ...view.querySelectorAll(
      ':scope > .dv-branch-node > .dv-split-view-container > .dv-view-container > .dv-view.visible',
    ),
  ].some((child) => hasVisibleGroup(child));
}

/**
 * Resolve a corner from Dockview's split topology, without measuring pixels.
 * Outer lane resizing and hiding cannot transfer ownership between groups.
 * Stop at this Dockview so nested Dockviews own their corners independently.
 */
export function checkGroupIsTopCorner(group: DockviewGroupPanel, side: 'left' | 'right'): boolean {
  if (group.api.location.type !== 'grid' || !group.api.isVisible) {
    return false;
  }

  const root = group.element.closest('.dv-dockview');
  if (!root) {
    return false;
  }

  if (group.api.isMaximized()) {
    return true;
  }

  let hasView = false;
  for (let ancestor = group.element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
    if (!ancestor.classList.contains('dv-view')) {
      continue;
    }

    hasView = true;
    if (!ancestor.classList.contains('visible')) {
      return false;
    }

    const views = ancestor.parentElement;
    const split = views?.parentElement;
    if (!views?.classList.contains('dv-view-container') || !split?.classList.contains('dv-split-view-container')) {
      return false;
    }

    const siblings = [...views.children].filter((view) => view.matches('.dv-view.visible') && hasVisibleGroup(view));
    const corner = side === 'right' && split.classList.contains('dv-horizontal') ? siblings.at(-1) : siblings[0];
    if (ancestor !== corner) {
      return false;
    }
  }

  return hasView;
}

/** {@link checkGroupIsTopCorner} for the top-right corner. */
export const checkGroupIsTopRight = (group: DockviewGroupPanel): boolean => checkGroupIsTopCorner(group, 'right');

const getServerSnapshot = (): boolean => false;

function useIsTopCornerGroup(group: DockviewGroupPanel, containerApi: DockviewApi, side: 'left' | 'right'): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      // Dockview publishes completed structural changes in a microtask. No
      // resize observer or later animation frame is needed to read its tree.
      const layout = containerApi.onDidLayoutChange(onChange);
      const maximized = containerApi.onDidMaximizedGroupChange(onChange);
      return () => {
        layout.dispose();
        maximized.dispose();
      };
    },
    [containerApi],
  );
  const getSnapshot = useCallback(() => checkGroupIsTopCorner(group, side), [group, side]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Whether a Dockview group holds its container's top-right corner. */
export const useIsTopRightGroup = (group: DockviewGroupPanel, containerApi: DockviewApi): boolean =>
  useIsTopCornerGroup(group, containerApi, 'right');

/** Whether a Dockview group holds its container's top-left corner. */
export const useIsTopLeftGroup = (group: DockviewGroupPanel, containerApi: DockviewApi): boolean =>
  useIsTopCornerGroup(group, containerApi, 'left');
