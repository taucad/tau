/** The sides and alignments Radix places a menu with, as `DropdownMenuContent` takes them. */
type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

/**
 * Where the viewer settings menu opens against its trigger, as `DropdownMenuContent`'s placement props. Offsets left
 * out take the menu's defaults.
 */
export type ViewerSettingsPlacement = Readonly<{
  side: Side | undefined;
  align: Align | undefined;
  /** Pixels. */
  sideOffset?: number;
  /** Pixels. */
  alignOffset?: number;
}>;

/** The edges of a box the placement reads, as `getBoundingClientRect` gives them. Pixels. */
type Edges = Readonly<{ right: number; bottom: number }>;

/** The gap between the bar's right edge and the menu beside it, and between the menu and the pane's edge. Pixels. */
const besideBarGapPx = 8;

/** The menu's width: the settings menu's `w-72`. Pixels. */
const viewerSettingsMenuWidthPx = 288;

/**
 * Where the viewer settings menu opens: to the right of the bar when the pane has room for it, its bottom edge on the
 * bar's outer bottom edge and `besideBarGapPx` from the bar's right edge; otherwise the fallback (above the gear).
 * Radix anchors a dropdown menu to its trigger only, so both offsets are measured from the gear's edges to the bar's.
 *
 * @param boxes - The bar's and the gear's boxes, and the viewer pane's right edge.
 * @param fallback - The placement when the menu does not fit beside the bar.
 * @returns The placement to open with.
 */
export const placeBesideBar = (
  boxes: Readonly<{ bar: Edges; trigger: Edges; paneRight: number }>,
  fallback: ViewerSettingsPlacement,
): ViewerSettingsPlacement => {
  const { bar, trigger, paneRight } = boxes;
  if (bar.right + besideBarGapPx + viewerSettingsMenuWidthPx + besideBarGapPx > paneRight) {
    return fallback;
  }
  return {
    side: 'right',
    align: 'end',
    sideOffset: bar.right - trigger.right + besideBarGapPx,
    // Negative: an end-aligned menu moves down past the gear's bottom edge by the bar's padding and border.
    alignOffset: trigger.bottom - bar.bottom,
  };
};

/**
 * Measure the gear's bar and viewer pane as the menu opens and place it with {@link placeBesideBar}. A gear outside a
 * viewer bar keeps the fallback; a bar outside a viewer frame measures against the window.
 *
 * @param trigger - The gear button.
 * @param fallback - The placement when the menu does not fit beside the bar.
 * @returns The placement to open with.
 */
export const measureViewerSettingsPlacement = (
  trigger: HTMLElement | undefined,
  fallback: ViewerSettingsPlacement,
): ViewerSettingsPlacement => {
  const bar = trigger?.closest<HTMLElement>('[data-slot=viewer-controls]');
  if (!trigger || !bar) {
    return fallback;
  }
  const pane = bar.closest<HTMLElement>('[data-viewer-frame]');
  return placeBesideBar(
    {
      bar: bar.getBoundingClientRect(),
      trigger: trigger.getBoundingClientRect(),
      paneRight: pane ? pane.getBoundingClientRect().right : document.documentElement.clientWidth,
    },
    fallback,
  );
};
