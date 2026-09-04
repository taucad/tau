import type { ComponentProps, FunctionComponent } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DockviewApi, DockviewReadyEvent, DockviewTheme, IDockviewHeaderActionsProps } from 'dockview-react';
import { DockviewReact } from 'dockview-react';
import { DockviewTabOverflowPicker } from '#components/panes/dockview-tab-overflow-picker.js';
import type { DockviewTabIconRenderer, DockviewTabProps } from '#components/panes/dockview-tab.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';
import { cn } from '@taucad/ui/utils/cn';

/**
 * Custom Dockview theme. The `dockview-theme-tau` class is applied to the root
 * element; all visual overrides are expressed as Tailwind className selectors
 * in `dockviewStyleOverrides` below (no separate CSS file).
 */
const tauDockviewTheme: DockviewTheme = {
  name: 'tau',
  className: 'dockview-theme-tau',
};

type DockviewProperties = Omit<ComponentProps<typeof DockviewReact>, 'scrollbars' | 'theme'> & {
  readonly getTabIcon?: DockviewTabIconRenderer;
  readonly tabLeadingIcon?: DockviewTabProps['leadingIcon'];
};

/**
 * Complete Tailwind-based theme for Dockview.
 *
 * Uses `[&_selector]:utility` for descendant rules and `[--var:value]` for CSS
 * custom property declarations (like code-editor.client.tsx does for Monaco).
 * Pseudo-element overrides use `[&_selector::before]` / `[&_selector::after]`
 * as arbitrary variants so Tailwind does not inject default `content`.
 */
export const dockviewStyleOverrides = cn(
  // ═══════════════════════════════════════════════════════════════════════════
  // CSS VARIABLE DECLARATIONS
  // Map Dockview's --dv-* tokens to the app's design tokens.
  // Set on the common shell ancestor so Dockview-owned overlays inherit them.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Core layout ──
  '[--dv-paneview-active-outline-color:transparent]',
  '[--dv-tabs-and-actions-container-font-size:13px]',
  '[--dv-tabs-and-actions-container-height:2.25rem]',
  '[--dv-tab-font-size:13px]',
  '[--dv-border-radius:0px]',
  '[--dv-tab-border-radius:var(--radius-sm)]',
  // Two 2px horizontal margins combine into the same 4px gap as the vertical inset.
  '[--dv-tab-margin:0.25rem_0.125rem]',
  '[--dv-overlay-z-index:999]',
  // ── Drag & drop ──
  '[--dv-drag-over-background-color:color-mix(in_oklch,var(--primary),transparent_80%)]',
  '[--dv-drag-over-border-color:var(--primary)]',
  '[&_.dv-drop-target-selection]:[border-radius:var(--dv-tab-border-radius)]',
  // ── Sash (resize handles) ──
  '[--dv-sash-color:transparent]',
  '[--dv-active-sash-color:var(--primary)]',
  '[--dv-active-sash-transition-duration:0.1s]',
  '[--dv-active-sash-transition-delay:0.5s]',
  // ── Sash cursor: col-resize / row-resize (adds the bar between arrows) ──
  '[&_.dv-split-view-container.dv-horizontal_>_.dv-sash-container_>_.dv-sash.dv-enabled]:!cursor-col-resize',
  '[&_.dv-split-view-container.dv-horizontal_>_.dv-sash-container_>_.dv-sash.dv-maximum]:!cursor-col-resize',
  '[&_.dv-split-view-container.dv-horizontal_>_.dv-sash-container_>_.dv-sash.dv-minimum]:!cursor-col-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-enabled]:!cursor-row-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-maximum]:!cursor-row-resize',
  '[&_.dv-split-view-container.dv-vertical_>_.dv-sash-container_>_.dv-sash.dv-minimum]:!cursor-row-resize',
  // ── Scrollbar ──
  '[--dv-tabs-container-scrollbar-color:var(--border)]',
  '[--dv-scrollbar-background-color:var(--border)]',
  // ── Tab scroll shadows: horizontal fade preserving top/bottom borders ──
  // Two mask layers composited with `add` (union):
  //   Layer 1 – border strips: 1px top + 1px bottom always fully opaque
  //   Layer 2 – horizontal scroll-fade gradient (animated via scroll-fade-x)
  // The union ensures tab borders remain crisp at the fade edges.
  '[&_.dv-tabs-container]:[--scroll-fade-size:42px]',
  '[&_.dv-tabs-container]:[--scroll-fade-end:transparent]',
  '[&_.dv-tabs-container]:[mask-image:linear-gradient(to_bottom,#000_1px,transparent_1px,transparent_calc(100%_-_1px),#000_calc(100%_-_1px)),linear-gradient(to_right,var(--scroll-fade-left),#000_var(--scroll-fade-size),#000_calc(100%_-_var(--scroll-fade-size)),var(--scroll-fade-right))]',
  '[&_.dv-tabs-container]:[mask-composite:add]',
  '[&_.dv-tabs-container]:[animation:scroll-fade-x_linear]',
  '[&_.dv-tabs-container]:[animation-timeline:scroll(self_x)]',
  // ── Floating panels ──
  '[--dv-floating-box-shadow:0_4px_12px_color-mix(in_oklch,var(--foreground),transparent_85%)]',
  '[--dv-icon-hover-background-color:var(--accent)]',
  // ── Group / panel backgrounds ──
  '[--dv-group-view-background-color:var(--background)]',
  '[--dv-tabs-and-actions-container-background-color:transparent]',
  // ── Active group tab colors ──
  '[--dv-activegroup-visiblepanel-tab-background-color:var(--accent)]',
  '[--dv-activegroup-hiddenpanel-tab-background-color:transparent]',
  '[--dv-activegroup-visiblepanel-tab-color:var(--foreground)]',
  '[--dv-activegroup-hiddenpanel-tab-color:var(--muted-foreground)]',
  // ── Inactive group tab colors ──
  '[--dv-inactivegroup-visiblepanel-tab-background-color:var(--accent)]',
  '[--dv-inactivegroup-hiddenpanel-tab-background-color:transparent]',
  '[--dv-inactivegroup-visiblepanel-tab-color:var(--foreground)]',
  '[--dv-inactivegroup-hiddenpanel-tab-color:var(--muted-foreground)]',
  // ── Borders / separators ──
  '[--dv-tab-divider-color:transparent]',
  '[--dv-separator-border:var(--border)]',

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURAL OVERRIDES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Drop-target: disable travel animation ──
  '[&_.dv-drop-target-container_.dv-drop-target-anchor.dv-drop-target-anchor-container-changed]:opacity-0',
  '[&_.dv-drop-target-container_.dv-drop-target-anchor.dv-drop-target-anchor-container-changed]:transition-none',

  // ── Tab bar container ──
  '[&_.dv-tabs-and-actions-container]:relative',
  '[&_.dv-tabs-and-actions-container]:z-6',

  // ── Adaptive horizontal tab geometry ──
  // Share available width equally from 160px down to a 112px floor, then scroll.
  // Width stays auto-basis so Dockview's !important zero-width drag states still win.
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]:w-40',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]:min-w-28',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]:max-w-40',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]:grow',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]:!shrink',
  // Complete the outer inline inset without widening the gap between tabs.
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)]:px-[0.125rem]',
  // The shared tab trigger owns the inset so its hover and tooltip hit areas
  // exactly match Dockview's outer tab box.
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]:!p-0',
  '[&_.dv-tabs-container]:border-b',
  '[&_.dv-tabs-container]:border-b-border',

  // Short separators only mark boundaries between two inactive tabs.
  "[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:content-['']",
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:absolute',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:!left-[-0.125rem]',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:!w-px',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:!top-1/2',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:!h-4',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:!-translate-y-1/2',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:!bg-border',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:z-5',
  '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]:pointer-events-none',

  // ── Separator replacements for split views ──
  // Border-top for vertical splits, border-left for horizontal splits, only
  // on non-first views to restore the visual separator.
  '[&_.dv-vertical_>_.dv-view-container_>_.dv-view:not(:first-child)_.dv-tabs-and-actions-container]:border-t',
  '[&_.dv-vertical_>_.dv-view-container_>_.dv-view:not(:first-child)_.dv-tabs-and-actions-container]:border-t-border',
  '[&_.dv-horizontal_>_.dv-view-container_>_.dv-view:not(:first-child)_.dv-tabs-and-actions-container]:border-l',
  '[&_.dv-horizontal_>_.dv-view-container_>_.dv-view:not(:first-child)_.dv-tabs-and-actions-container]:border-l-border',

  // ── Bottom border on non-tab tab-bar children ──
  // Continuous border line across void-container, actions containers, and pre-actions.
  '[&_.dv-void-container]:border-b',
  '[&_.dv-void-container]:border-b-border',
  '[&_.dv-right-actions-container]:border-b',
  '[&_.dv-right-actions-container]:border-b-border',
  '[&_.dv-left-actions-container]:border-b',
  '[&_.dv-left-actions-container]:border-b-border',
  '[&_.dv-pre-actions-container]:border-b',
  '[&_.dv-pre-actions-container]:border-b-border',
  // ── Close button styling ──
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action]:text-muted-foreground',
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action]:bg-transparent',
  // Match the tab until the close action itself is hovered. The opaque fill
  // masks the title beneath the close action without showing a separate pill.
  '[&_.dv-tab:hover_.dv-default-tab_.dv-default-tab-action:not(:hover)]:!bg-accent',
  '[&_.dv-tab.dv-active-tab_.dv-default-tab_.dv-default-tab-action:not(:hover)]:!bg-accent',
  '[&_.dv-tab.dv-active-tab_.dockview-tab-title]:[--scroll-fade-size:42px]',
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action:hover]:text-foreground',
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action:hover]:!bg-input',

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB STATES
  // ═══════════════════════════════════════════════════════════════════════════

  '[&_.dv-tab]:rounded-sm',
  '[&_.dv-tab]:transition-colors',
  '[&_.dv-tab:not(.dv-active-tab):hover]:!bg-accent',
  '[&_.dv-tab:not(.dv-active-tab):hover]:!text-muted-foreground',
  '[&_.dv-tab:focus-visible]:outline-none',
  '[&_.dv-tab:focus-visible]:ring-2',
  '[&_.dv-tab:focus-visible]:ring-ring',
  '[&_.dv-tab.dv-active-tab_.dv-default-tab-action]:opacity-100',
  '[&_.dv-tab:focus-within_.dv-default-tab-action]:visible',
  '[&_.dv-tab:focus-within_.dv-default-tab-action]:opacity-100',

  // ── Tab focus overlay ──
  // Dockview's core CSS (un-layered) creates a full-size ::after on
  // :focus/:focus-within with width/height 100%, z-index 5, and outline
  // !important. Because our Tailwind utilities live inside @layer utilities,
  // normal declarations lose to un-layered ones regardless of specificity.
  // On `:last-child` tabs the divider's background-color still applies while
  // dockview's width:100% wins, turning the 1px divider into a full grey
  // overlay. Using !important reverses the cascade (layered !important >
  // un-layered normal), fully preventing the pseudo-element from rendering.
  '[&_.dv-tab:focus::after]:![content:none]',
  '[&_.dv-tab:focus-within::after]:![content:none]',
  '[&_.dv-tab:focus::after]:![outline:none]',
  '[&_.dv-tab:focus-within::after]:![outline:none]',

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION CONTAINER & HOVER VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Action container centering ──
  // Dockview's .dv-react-part wrapper uses height/width: 100% but no flex
  // centering, so action buttons sit at the top instead of vertically centred.
  '[&_.dv-right-actions-container_>_.dv-react-part]:flex',
  '[&_.dv-right-actions-container_>_.dv-react-part]:items-center',
  '[&_.dv-right-actions-container_>_.dv-react-part]:pr-1',
  '[&_.dv-left-actions-container_>_.dv-react-part]:flex',
  '[&_.dv-left-actions-container_>_.dv-react-part]:items-center',
  '[&_.dv-left-actions-container_button]:!h-7',
  '[&_.dv-right-actions-container_button]:!h-7',
  '[&_.dv-pre-actions-container_button]:!h-7',
  '[&_.dv-left-actions-container_button:has(>svg:only-child)]:!w-7',
  '[&_.dv-right-actions-container_button:has(>svg:only-child)]:!w-7',
  '[&_.dv-pre-actions-container_button:has(>svg:only-child)]:!w-7',
  '[&_:is(.dv-left-actions-container,.dv-right-actions-container,.dv-pre-actions-container)_button]:!bg-transparent',
  '[&_:is(.dv-left-actions-container,.dv-right-actions-container,.dv-pre-actions-container)_button:hover]:!bg-muted-foreground/15',

  // ── Group-hover action button visibility ──
  // Hidden by default, shown on group hover to reduce visual noise.
  '[&_.dv-pane-action]:opacity-0',
  '[&_.dv-pane-action]:transition-opacity',
  '[&_.dv-pane-action]:duration-150',
  '[&_.dv-pane-action]:ease-in-out',
  // Show on group hover
  '[&_.dv-groupview:hover_.dv-pane-action]:opacity-100',
  // Keep keyboard-focused and expanded actions visible without requiring hover.
  '[&_.dv-groupview:focus-within_.dv-pane-action]:opacity-100',
  '[&_.dv-pane-action[aria-expanded=true]]:opacity-100',
  // Always show when group has no tabs (empty / watermark state)
  '[&_.dv-groupview:not(:has(.dv-tab))_.dv-pane-action]:opacity-100',

  // ── Content container background ──
  '[&_.dv-groupview_>_.dv-content-container]:bg-background',

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS CONTAINMENT OVERRIDES
  // Remove containment that breaks position:fixed for Monaco widgets.
  // ═══════════════════════════════════════════════════════════════════════════

  // Root: Dockview's .dv-dockview has `contain: layout` which creates a new
  // containing block for position:fixed descendants (per CSS Containment spec).
  // This causes Monaco's fixedOverflowWidgets to position relative to
  // .dv-dockview instead of the viewport, rendering them off-screen.
  '[&_.dv-dockview]:[contain:none]',

  // Render overlay: remove ALL containing-block and stacking-context properties.
  // This is the innermost wrapper around panel content.
  '[&_.dv-render-overlay]:[contain:none]',
  '[&_.dv-render-overlay]:transform-none',
  '[&_.dv-render-overlay]:[will-change:auto]',
  '[&_.dv-render-overlay]:[backface-visibility:visible]',
  '[&_.dv-render-overlay]:isolation-auto',

  // Animation: during resize/drag animations Dockview applies transform and
  // will-change on .dv-view which creates a temporary containing block.
  // Override to prevent position:fixed widgets from shifting during animation.
  '[&_.dv-split-view-container.dv-animation_.dv-view]:[will-change:auto]',
  '[&_.dv-split-view-container.dv-animation_.dv-view]:transform-none',
  '[&_.dv-split-view-container.dv-animation_.dv-view]:[backface-visibility:visible]',
);

/**
 * Scroll the active tab fully into view within its group's tab bar.
 *
 * Dockview's built-in scroll fires synchronously before the browser
 * reflows newly added tabs, so their widths can be zero. This helper
 * runs after layout to correct the scroll position.
 */
export function scrollActiveTabIntoView(api: DockviewApi): void {
  requestAnimationFrame(() => {
    const group = api.activeGroup;
    if (!group) {
      return;
    }

    const tabsContainer = group.element.querySelector<HTMLElement>('.dv-tabs-container');
    const activeTab = tabsContainer?.querySelector<HTMLElement>('.dv-tab.dv-active-tab');
    if (!tabsContainer || !activeTab) {
      return;
    }

    const tabLeft = activeTab.offsetLeft;
    const tabRight = tabLeft + activeTab.offsetWidth;
    const { scrollLeft } = tabsContainer;
    const visibleRight = scrollLeft + tabsContainer.clientWidth;

    if (tabLeft < scrollLeft) {
      tabsContainer.scrollLeft = tabLeft;
    } else if (tabRight > visibleRight) {
      tabsContainer.scrollLeft = Math.min(tabLeft, tabRight - tabsContainer.clientWidth);
    }
  });
}

/**
 * Themed Dockview wrapper.
 *
 * Renders `DockviewReact` with the `tauDockviewTheme` applied automatically.
 * All theme styling -- CSS variable declarations, tab states, action button
 * visibility, shell overlays, containment overrides
 * -- is expressed as Tailwind className selectors in `dockviewStyleOverrides`
 * above, keeping everything co-located with the component and in sync with the
 * Tailwind theme.
 *
 * Dockview v4.13+ defaults to `'onlyWhenVisible'` rendering, which appends
 * panel content directly into `.dv-content-container` (a child of
 * `.dv-groupview`).  This keeps the content inside the groupview DOM tree,
 * allowing plain CSS `.dv-groupview:hover` to fire for both the tab bar and
 * the content area of every split pane.
 *
 * Also wires a post-layout scroll correction so that the active tab is always
 * fully visible after panel activation — working around Dockview's synchronous
 * scroll that fires before the browser reflows newly-added tab elements.
 */
export function Dockview({
  className,
  getTabIcon,
  onReady,
  rightHeaderActionsComponent,
  tabLeadingIcon,
  ...properties
}: DockviewProperties): React.JSX.Element {
  const disposableRef = useRef<{ dispose(): void } | undefined>(undefined);
  const RightHeaderActions = useMemo<FunctionComponent<IDockviewHeaderActionsProps>>(() => {
    const CallerActions = rightHeaderActionsComponent;
    const ComposedRightHeaderActions = (actionProperties: IDockviewHeaderActionsProps): React.JSX.Element => (
      <div className='flex h-full items-center gap-1'>
        <DockviewTabOverflowPicker {...actionProperties} getIcon={getTabIcon} leadingIcon={tabLeadingIcon} />
        {CallerActions ? <CallerActions {...actionProperties} /> : null}
      </div>
    );
    ComposedRightHeaderActions.displayName = 'DockviewRightHeaderActions';
    return ComposedRightHeaderActions;
  }, [getTabIcon, rightHeaderActionsComponent, tabLeadingIcon]);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      disposableRef.current?.dispose();
      disposableRef.current = event.api.onDidActivePanelChange(() => {
        scrollActiveTabIntoView(event.api);
      });
      onReady(event);
    },
    [onReady],
  );

  useEffect(() => {
    return () => {
      disposableRef.current?.dispose();
    };
  }, []);

  return (
    <OmniScroller className={cn('size-full', dockviewStyleOverrides)} viewportSelector='.dv-tabs-container'>
      <DockviewReact
        {...properties}
        className={className}
        disableTabsOverflowList
        rightHeaderActionsComponent={RightHeaderActions}
        scrollbars='native'
        theme={tauDockviewTheme}
        onReady={handleReady}
      />
    </OmniScroller>
  );
}
