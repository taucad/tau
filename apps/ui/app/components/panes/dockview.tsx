import type { ComponentProps, FunctionComponent, MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { DockviewApi, DockviewReadyEvent, IDockviewHeaderActionsProps } from 'dockview-react';
import { DockviewReact } from 'dockview-react';
import { DockviewStyles } from '#components/panes/dockview-styles.js';
import { DockviewTabOverflowPicker } from '#components/panes/dockview-tab-overflow-picker.js';
import type { DockviewTabIconRenderer, DockviewTabProps } from '#components/panes/dockview-tab.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';
import { cn } from '@taucad/ui/utils/cn';
import { isDesktopTarget } from '#lib/build-target.js';
import { useResizeHandles } from '@taucad/workbench-panes/paneview/use-resize-handles';
import { dockviewResizeHandle } from '@taucad/workbench-panes/paneview/resize-handle';
import { dockviewStyleOverrides, tauDockviewTheme } from '@taucad/workbench-panes/paneview/dockview-theme';

type DockviewProperties = Omit<ComponentProps<typeof DockviewReact>, 'scrollbars' | 'theme'> & {
  readonly getTabIcon?: DockviewTabIconRenderer;
  readonly tabLeadingIcon?: DockviewTabProps['leadingIcon'];
};

const desktopDockviewStyleOverrides = isDesktopTarget()
  ? cn(
      '[&_.dv-tabs-and-actions-container]:[app-region:no-drag]',
      '[&_:is(.dv-tabs-container,.dv-void-container)]:[app-region:drag]',
      '[&_:is(.dv-tab,.dv-left-actions-container,.dv-right-actions-container,.dv-pre-actions-container)]:[app-region:no-drag]',
    )
  : undefined;

/**
 * Scroll one tab strip so its active tab sits fully beyond the edge fades,
 * then notify Dockview's custom scrollbar so its cached offset follows.
 */
function revealActiveTab(tabsContainer: HTMLElement): void {
  const activeTab = tabsContainer.querySelector<HTMLElement>('.dv-tab.dv-active-tab');
  if (!activeTab) {
    return;
  }

  const tabLeft = activeTab.offsetLeft;
  const tabRight = tabLeft + activeTab.offsetWidth;
  const { scrollLeft } = tabsContainer;
  const fadeSize = Number.parseFloat(getComputedStyle(tabsContainer).getPropertyValue('--scroll-fade-size')) || 0;
  const visibleLeft = scrollLeft + fadeSize;
  const visibleRight = scrollLeft + tabsContainer.clientWidth - fadeSize;

  if (tabLeft < visibleLeft) {
    tabsContainer.scrollLeft = Math.max(0, tabLeft - fadeSize);
    tabsContainer.dispatchEvent(new Event('scroll'));
  } else if (tabRight > visibleRight) {
    tabsContainer.scrollLeft = Math.max(
      0,
      Math.min(tabLeft - fadeSize, tabRight - tabsContainer.clientWidth + fadeSize),
    );
    tabsContainer.dispatchEvent(new Event('scroll'));
  }
}

/** Reveal the active group's tab after its DOM mutation has completed. */
export function scrollActiveTabIntoView(api: DockviewApi): void {
  const tabs = api.activeGroup?.element.querySelector<HTMLElement>('.dv-tabs-container');
  if (tabs) {
    revealActiveTab(tabs);
  }
}

/** One prepaint owner for each strip, including inactive groups during resize. */
function useRevealActiveTab(group: IDockviewHeaderActionsProps['group']): void {
  useLayoutEffect(() => {
    const tabs = group.element.querySelector<HTMLElement>('.dv-tabs-container');
    if (!tabs) {
      return;
    }

    const reveal = (): void => {
      revealActiveTab(tabs);
    };
    const sizeObserver = new ResizeObserver(reveal);
    sizeObserver.observe(tabs);
    // Dockview activates and inserts tabs imperatively. A mutation delivery
    // sees the completed operation without postponing scroll until another paint.
    const tabsObserver = new MutationObserver(reveal);
    tabsObserver.observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    reveal();

    return () => {
      sizeObserver.disconnect();
      tabsObserver.disconnect();
    };
  }, [group]);
}

/**
 * Themed Dockview wrapper.
 *
 * Renders `DockviewReact` with the `tauDockviewTheme` applied automatically.
 * CSS variables, tab states, actions, shell overlays and containment overrides
 * live in `dockviewStyleOverrides`. Native resize feedback is shared with the
 * other pane engines in `pane-resize.css`.
 *
 * Dockview v4.13+ defaults to `'onlyWhenVisible'` rendering, which appends
 * panel content directly into `.dv-content-container` (a child of
 * `.dv-groupview`).  This keeps the content inside the groupview DOM tree,
 * allowing plain CSS `.dv-groupview:hover` to fire for both the tab bar and
 * the content area of every split pane.
 *
 * Keeps sizing and active-tab reveal in the same prepaint delivery as the
 * parent resize or tab mutation, without a chain of later-frame corrections.
 */
export function Dockview({
  className,
  getTabIcon,
  onReady,
  rightHeaderActionsComponent,
  tabLeadingIcon,
  ...properties
}: DockviewProperties): React.JSX.Element {
  const resizeRootRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DockviewApi | undefined>(undefined);
  useResizeHandles(resizeRootRef, (sash) => dockviewResizeHandle(apiRef.current, sash));
  const RightHeaderActions = useMemo<FunctionComponent<IDockviewHeaderActionsProps>>(() => {
    const CallerActions = rightHeaderActionsComponent;
    const ComposedRightHeaderActions = function DockviewRightHeaderActions(
      actionProperties: IDockviewHeaderActionsProps,
    ): React.JSX.Element {
      useRevealActiveTab(actionProperties.group);
      return (
        <div className='flex h-full items-center gap-1'>
          <DockviewTabOverflowPicker {...actionProperties} getIcon={getTabIcon} leadingIcon={tabLeadingIcon} />
          {CallerActions ? <CallerActions {...actionProperties} /> : null}
        </div>
      );
    };
    return ComposedRightHeaderActions;
  }, [getTabIcon, rightHeaderActionsComponent, tabLeadingIcon]);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      onReady(event);
    },
    [onReady],
  );

  const handleTabClick = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    const api = apiRef.current;
    if (!api || !(event.target instanceof Element)) {
      return;
    }
    if (event.target.closest('.dv-tab')) {
      // Native tab handlers have completed by the bubble phase. Re-clicking
      // the active tab may scroll it without changing its active class.
      scrollActiveTabIntoView(api);
    }
  }, []);

  useLayoutEffect(() => {
    const root = resizeRootRef.current;
    if (!root) {
      return;
    }
    const layout = (): void => {
      const api = apiRef.current;
      if (!api || !root.isConnected || !root.offsetParent) {
        return;
      }
      const width = root.clientWidth;
      const height = root.clientHeight;
      if (width > 0 && height > 0 && (api.width !== width || api.height !== height)) {
        api.layout(width, height);
      }
    };
    // Observe the externally sized shell, not a child whose layout we change.
    // Dockview's automatic observer delays through RAF, exposing stale group
    // widths for a paint whenever an outer pane opens or its sash moves.
    const observer = new ResizeObserver(layout);
    observer.observe(root);
    layout();
    return () => {
      observer.disconnect();
      apiRef.current = undefined;
    };
  }, []);

  return (
    <OmniScroller
      ref={resizeRootRef}
      data-resize-owner
      className={cn('pane-resize size-full', dockviewStyleOverrides, desktopDockviewStyleOverrides)}
      viewportSelector='.dv-tabs-container'
      onClick={handleTabClick}
    >
      <DockviewStyles />
      <DockviewReact
        {...properties}
        className={className}
        disableFloatingGroups
        disableAutoResizing
        disableTabsOverflowList
        rightHeaderActionsComponent={RightHeaderActions}
        scrollbars='custom'
        theme={tauDockviewTheme}
        onReady={handleReady}
      />
    </OmniScroller>
  );
}
