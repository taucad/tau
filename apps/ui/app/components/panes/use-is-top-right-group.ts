import { useEffect, useState } from 'react';
import type { DockviewApi, DockviewGroupPanel, DockviewPanelApi } from 'dockview-react';

/**
 * Tolerance (px) when comparing bounding-rect edges.
 * Accounts for sub-pixel rounding differences between elements.
 */
export const edgeTolerance = 2;

/** Prefer floating-panel bounds; bare Dockviews use their own root. */
const dockviewContainerSelector = '[data-slot="floating-panel"][data-state="open"], .dockview-theme-tau';

/**
 * Synchronously checks whether a Dockview group occupies the top-right
 * corner of its nearest open floating panel or bare Dockview root.
 *
 * Exported for unit testing.  The companion hook {@link useIsTopRightGroup}
 * calls this inside a `ResizeObserver` / `onDidLayoutChange` callback.
 *
 * A group is considered "top-right" when:
 * 1. It is in the grid (not floating / popout).
 * 2. It is inside an open floating panel or `.dockview-theme-tau` root.
 * 3. Its right edge aligns with that container's right edge.
 * 4. Its top edge aligns with that container's top edge.
 */
export function checkGroupIsTopRight(group: DockviewGroupPanel): boolean {
  if (group.api.location.type !== 'grid') {
    return false;
  }

  const floatingPanel = group.element.closest(dockviewContainerSelector);

  if (!floatingPanel) {
    return false;
  }

  const panelRect = floatingPanel.getBoundingClientRect();
  const groupRect = group.element.getBoundingClientRect();

  if (groupRect.width === 0 || groupRect.height === 0) {
    return false;
  }

  const isAtRight = Math.abs(groupRect.right - panelRect.right) < edgeTolerance;
  const isAtTop = Math.abs(groupRect.top - panelRect.top) < edgeTolerance;

  return isAtRight && isAtTop;
}

/**
 * Determines whether a Dockview group occupies the top-right corner of its
 * nearest open floating panel or Dockview root.
 *
 * The check is re-evaluated whenever the group element resizes (via
 * `ResizeObserver`) or the Dockview layout changes. `ResizeObserver` runs
 * after layout, so the group has its settled size.
 */
export function useIsTopRightGroup(group: DockviewGroupPanel, containerApi: DockviewApi): boolean {
  const [isTopRight, setIsTopRight] = useState(false);

  useEffect(() => {
    let rafId: number | undefined;

    function scheduleCheck(): void {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(check);
    }

    function check(): void {
      rafId = undefined;
      setIsTopRight(checkGroupIsTopRight(group));
    }

    // Re-check when the group element resizes.  This covers:
    //  - initial mount (observer fires immediately on observe)
    //  - parent panel open/close (Allotment visibility changes)
    //  - container resize (Allotment sash drag, window resize)
    const resizeObserver = new ResizeObserver(scheduleCheck);
    resizeObserver.observe(group.element);

    // Re-check when the dockview layout changes (split, move, panel add/remove)
    const disposable = containerApi.onDidLayoutChange(scheduleCheck);

    return () => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }

      resizeObserver.disconnect();
      disposable.dispose();
    };
  }, [group, containerApi]);

  return isTopRight;
}

/**
 * Synchronously checks whether a Dockview panel's group occupies the
 * top-right corner of its nearest `.dv-dockview` ancestor.
 *
 * Exported for unit testing.  The companion hook {@link useIsTopRightPanel}
 * calls this inside a `ResizeObserver` / `onDidLayoutChange` callback.
 */
export function checkPanelIsTopRight(panelApi: DockviewPanelApi): boolean {
  const { group } = panelApi;

  if (group.api.location.type !== 'grid') {
    return false;
  }

  const dockviewContainer = group.element.closest('.dv-dockview');

  if (!dockviewContainer) {
    return false;
  }

  const containerRect = dockviewContainer.getBoundingClientRect();
  const groupRect = group.element.getBoundingClientRect();

  if (groupRect.width === 0 || groupRect.height === 0) {
    return false;
  }

  const isAtRight = Math.abs(groupRect.right - containerRect.right) < edgeTolerance;
  const isAtTop = Math.abs(groupRect.top - containerRect.top) < edgeTolerance;

  return isAtRight && isAtTop;
}

/**
 * Determines whether a Dockview panel's group occupies the top-right corner
 * of its dockview container.
 *
 * Similar to {@link useIsTopRightGroup} but designed for use inside panel
 * content components that receive a `DockviewPanelApi` rather than a raw
 * `DockviewGroupPanel`.  It compares the group's bounding rect against the
 * nearest `.dv-dockview` ancestor (the dockview root element).
 *
 * The check re-runs when:
 * - The group element resizes (ResizeObserver)
 * - The dockview layout changes (split, move, panel add/remove)
 * - The panel moves to a different group (`onDidGroupChange`)
 */
export function useIsTopRightPanel(panelApi: DockviewPanelApi, containerApi: DockviewApi): boolean {
  const [isTopRight, setIsTopRight] = useState(false);

  useEffect(() => {
    let rafId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    function scheduleCheck(): void {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(check);
    }

    function check(): void {
      rafId = undefined;
      setIsTopRight(checkPanelIsTopRight(panelApi));
    }

    // Observe the current group element for resize.
    // When the panel moves to a different group, we disconnect the old
    // observer and create a new one for the new group element.
    function observeGroup(): void {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleCheck);
      resizeObserver.observe(panelApi.group.element);
    }

    observeGroup();

    // Re-check when the dockview layout changes (split, move, panel add/remove)
    const layoutDisposable = containerApi.onDidLayoutChange(scheduleCheck);

    // Re-check when the panel moves to a different group
    const groupChangeDisposable = panelApi.onDidGroupChange(() => {
      observeGroup();
      scheduleCheck();
    });

    return () => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }

      resizeObserver?.disconnect();
      layoutDisposable.dispose();
      groupChangeDisposable.dispose();
    };
  }, [panelApi, containerApi]);

  return isTopRight;
}
