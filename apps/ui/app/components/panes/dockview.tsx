import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DockviewApi, DockviewReadyEvent, DockviewTheme } from 'dockview-react';
import { DockviewReact } from 'dockview-react';
import { cn } from '#utils/ui.utils.js';
import { DockviewSplitAction } from '#components/panes/dockview-split-action.js';

/**
 * Custom Dockview theme. The `dockview-theme-tau` class is applied to the root
 * element; all visual overrides are expressed as Tailwind className selectors
 * in `dockviewTailwindOverrides` below (no separate CSS file).
 */
const tauDockviewTheme: DockviewTheme = {
  name: 'tau',
  className: 'dockview-theme-tau',
};

type DockviewProperties = Omit<ComponentProps<typeof DockviewReact>, 'theme'>;

/**
 * Complete Tailwind-based theme for Dockview.
 *
 * Uses `[&_selector]:utility` for descendant rules and `[--var:value]` for CSS
 * custom property declarations (like code-editor.client.tsx does for Monaco).
 * Pseudo-element overrides use `[&_selector::before]` / `[&_selector::after]`
 * as arbitrary variants so Tailwind does not inject default `content`.
 */
const dockviewTailwindOverrides = cn(
  // ═══════════════════════════════════════════════════════════════════════════
  // CSS VARIABLE DECLARATIONS
  // Map Dockview's --dv-* tokens to the app's design tokens.
  // Set directly on the root element (same element as .dockview-theme-tau).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Core layout ──
  '[--dv-paneview-active-outline-color:transparent]',
  '[--dv-tabs-and-actions-container-font-size:13px]',
  '[--dv-tabs-and-actions-container-height:1.9375rem]',
  '[--dv-tab-font-size:var(--text-sm)]',
  '[--dv-border-radius:0px]',
  '[--dv-tab-margin:0]',
  '[--dv-overlay-z-index:999]',
  // ── Drag & drop ──
  '[--dv-drag-over-background-color:color-mix(in_oklch,var(--primary),transparent_80%)]',
  '[--dv-drag-over-border-color:var(--primary)]',
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
  '[&_.dv-tabs-container]:[--scroll-fade-size:14px]',
  '[&_.dv-tabs-container]:[mask-image:linear-gradient(to_bottom,#000_1px,transparent_1px,transparent_calc(100%_-_1px),#000_calc(100%_-_1px)),linear-gradient(to_right,var(--scroll-fade-left),#000_var(--scroll-fade-size),#000_calc(100%_-_var(--scroll-fade-size)),var(--scroll-fade-right))]',
  '[&_.dv-tabs-container]:[mask-composite:add]',
  '[&_.dv-tabs-container]:[animation:scroll-fade-x_linear]',
  '[&_.dv-tabs-container]:[animation-timeline:scroll(self_x)]',
  // ── Floating panels ──
  '[--dv-floating-box-shadow:0_4px_12px_color-mix(in_oklch,var(--foreground),transparent_85%)]',
  '[--dv-icon-hover-background-color:var(--accent)]',
  // ── Group / panel backgrounds ──
  '[--dv-group-view-background-color:var(--background)]',
  '[--dv-tabs-and-actions-container-background-color:var(--muted)]',
  // ── Active group tab colors ──
  '[--dv-activegroup-visiblepanel-tab-background-color:var(--background)]',
  '[--dv-activegroup-hiddenpanel-tab-background-color:var(--muted)]',
  '[--dv-activegroup-visiblepanel-tab-color:var(--foreground)]',
  '[--dv-activegroup-hiddenpanel-tab-color:var(--muted-foreground)]',
  // ── Inactive group tab colors ──
  '[--dv-inactivegroup-visiblepanel-tab-background-color:var(--background)]',
  '[--dv-inactivegroup-hiddenpanel-tab-background-color:var(--muted)]',
  '[--dv-inactivegroup-visiblepanel-tab-color:var(--muted-foreground)]',
  '[--dv-inactivegroup-hiddenpanel-tab-color:var(--muted-foreground)]',
  // ── Borders / separators ──
  '[--dv-tab-divider-color:var(--border)]',
  '[--dv-separator-border:var(--border)]',

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURAL OVERRIDES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Drop-target: disable travel animation ──
  '[&_.dv-drop-target-container_.dv-drop-target-anchor.dv-drop-target-anchor-container-changed]:opacity-0',
  '[&_.dv-drop-target-container_.dv-drop-target-anchor.dv-drop-target-anchor-container-changed]:transition-none',

  // ── Tab bar container ──
  // position: relative + z-index lifts the tab bar above the dv-separator-border
  // ::before pseudo-element so the primary top indicator is not clipped.
  '[&_.dv-tabs-and-actions-container]:relative',
  '[&_.dv-tabs-and-actions-container]:z-6',

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
  // Left actions left padding (calc(var(--spacing)) = pl-1)
  '[&_.dv-left-actions-container]:pl-1',

  // ── Close button styling ──
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action]:text-muted-foreground',
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action:hover]:text-foreground',
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action:hover]:bg-accent',
  '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action:hover]:rounded-[2px]',

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB BORDERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Default tab borders ──
  // Top: 1px transparent (primary for active tab in focused group).
  // Bottom: 1px var(--border) for separation; active tab uses bg colour → seamless.
  '[&_.dv-tab]:border-t',
  '[&_.dv-tab]:border-t-transparent',
  '[&_.dv-tab]:border-b',
  '[&_.dv-tab]:border-b-border',

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

  // ── Inter-tab divider (v6 no longer adds .dv-horizontal on .dv-tabs-container,
  // so upstream's divider rule never matches; paint ::before ourselves.)
  "[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:content-['_']",
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:absolute',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:[top:-1px]',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:[bottom:-1px]',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:left-0',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:w-px',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:h-auto',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:z-5',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:pointer-events-none',
  '[&_.dv-tabs-container_.dv-tab:not(:first-child)::before]:[background-color:var(--dv-tab-divider-color)]',

  // ── Last-tab right divider ──
  // Separator between the last tab and the void / actions area.
  "[&_.dv-tabs-container_.dv-tab:last-child::after]:content-['_']",
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:absolute',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:[top:-1px]',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:[bottom:-1px]',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:right-0',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:z-5',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:pointer-events-none',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:[background-color:var(--dv-tab-divider-color)]',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:w-px',
  '[&_.dv-tabs-container_.dv-tab:last-child::after]:h-auto',

  // ── Active tab bottom border → seamless with content ──
  '[&_.dv-tab.dv-active-tab]:border-b-background',
  // ── Active group: primary top indicator on active tab ──
  '[&_.dv-groupview.dv-active-group_>_.dv-tabs-and-actions-container_.dv-tabs-container_>_.dv-tab.dv-active-tab]:border-t-primary',
  // ── Inactive group: no top indicator ──
  '[&_.dv-groupview.dv-inactive-group_>_.dv-tabs-and-actions-container_.dv-tabs-container_>_.dv-tab.dv-active-tab]:border-t-transparent',

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

  // ── Group-hover action button visibility ──
  // Hidden by default, shown on group hover to reduce visual noise.
  '[&_.dv-pane-action]:opacity-0',
  '[&_.dv-pane-action]:transition-opacity',
  '[&_.dv-pane-action]:duration-150',
  '[&_.dv-pane-action]:ease-in-out',
  '[&_.dv-tabs-overflow-dropdown-root]:opacity-0',
  '[&_.dv-tabs-overflow-dropdown-root]:transition-opacity',
  '[&_.dv-tabs-overflow-dropdown-root]:duration-150',
  '[&_.dv-tabs-overflow-dropdown-root]:ease-in-out',
  // Show on group hover
  '[&_.dv-groupview:hover_.dv-pane-action]:opacity-100',
  '[&_.dv-groupview:hover_.dv-tabs-overflow-dropdown-root]:opacity-100',
  // Always show when group has no tabs (empty / watermark state)
  '[&_.dv-groupview:not(:has(.dv-tab))_.dv-pane-action]:opacity-100',
  '[&_.dv-groupview:not(:has(.dv-tab))_.dv-tabs-overflow-dropdown-root]:opacity-100',

  // ── Tab overflow dropdown ──
  // Dockview creates this as a vanilla DOM element with no React API.
  // Root wrapper
  '[&_.dv-tabs-overflow-dropdown-root]:m-0',
  '[&_.dv-tabs-overflow-dropdown-root]:flex',
  '[&_.dv-tabs-overflow-dropdown-root]:shrink-0',
  '[&_.dv-tabs-overflow-dropdown-root]:items-center',
  '[&_.dv-tabs-overflow-dropdown-root]:p-0',
  // Button -- match PaneButton sizing and hover
  '[&_.dv-tabs-overflow-dropdown-default]:flex',
  '[&_.dv-tabs-overflow-dropdown-default]:size-6',
  '[&_.dv-tabs-overflow-dropdown-default]:items-center',
  '[&_.dv-tabs-overflow-dropdown-default]:justify-center',
  '[&_.dv-tabs-overflow-dropdown-default]:gap-0',
  '[&_.dv-tabs-overflow-dropdown-default]:rounded-sm',
  '[&_.dv-tabs-overflow-dropdown-default]:p-0',
  '[&_.dv-tabs-overflow-dropdown-default]:text-muted-foreground',
  '[&_.dv-tabs-overflow-dropdown-default]:transition-colors',
  '[&_.dv-tabs-overflow-dropdown-default:hover]:bg-muted-foreground/15',
  '[&_.dv-tabs-overflow-dropdown-default:hover]:text-foreground',
  // Chevron SVG
  '[&_.dv-tabs-overflow-dropdown-default_>_svg]:size-2.5',
  '[&_.dv-tabs-overflow-dropdown-default_>_svg]:shrink-0',
  '[&_.dv-tabs-overflow-dropdown-default_>_svg]:rotate-90',
  // Hide tab count span (dropdown itself shows all overflow tabs)
  '[&_.dv-tabs-overflow-dropdown-default_>_span]:hidden',

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
 * Includes a "split right" button in the right side of each group's tab bar
 * (visible on hover).
 *
 * All theme styling -- CSS variable declarations, tab borders, pseudo-element
 * dividers, action button visibility, overflow dropdown, containment overrides
 * -- is expressed as Tailwind className selectors in `dockviewTailwindOverrides`
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
export function Dockview({ className, onReady, ...properties }: DockviewProperties): React.JSX.Element {
  const mergedClassName = useMemo(() => cn(dockviewTailwindOverrides, className), [className]);
  const disposableRef = useRef<{ dispose(): void } | undefined>(undefined);

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
    <DockviewReact
      {...properties}
      className={mergedClassName}
      theme={tauDockviewTheme}
      onReady={handleReady}
      rightHeaderActionsComponent={properties.rightHeaderActionsComponent ?? DockviewSplitAction}
    />
  );
}
