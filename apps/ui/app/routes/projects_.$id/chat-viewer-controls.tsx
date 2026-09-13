import { useMemo } from 'react';
import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';
import { FovControl } from '#components/geometry/cad/fov-control.js';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';
import { ResetCameraControl } from '#components/geometry/cad/reset-camera-control.js';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';
import { CaptureViewControl, CaptureViewOverflowControl } from '#components/geometry/cad/capture-view-control.js';
import { ViewerSettings } from '#components/geometry/cad/viewer-settings.js';
import {
  FovOverflowControl,
  GridOverflowControl,
  SectionViewOverflowControl,
  MeasureOverflowControl,
  ResetCameraOverflowControl,
} from '#components/geometry/cad/viewer-overflow-controls.js';
import { cn } from '#utils/ui.utils.js';
import { useToolbarOverflow } from '#hooks/use-toolbar-overflow.js';
import type { ToolbarItemConfig } from '#hooks/use-toolbar-overflow.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';

/**
 * Control items ordered by "stickiness" (first = last to overflow).
 * FOV stays visible the longest; reset camera overflows first.
 */
const controlItems3d: ToolbarItemConfig[] = [
  { id: 'fov', width: 200, compactWidth: 120 },
  { id: 'grid', width: 32 },
  { id: 'section', width: 32 },
  { id: 'measure', width: 32 },
  { id: 'reset', width: 32 },
  { id: 'capture', width: 32 },
];

/** Same as above but without FOV (not applicable to 2D views). */
const controlItems2d: ToolbarItemConfig[] = controlItems3d.filter((item) => item.id !== 'fov');

/** Gap-2 = 8px, settings button (32px) + one gap (8px) = 40px reserved */
const overflowOptions = { gap: 8, reservedWidth: 40 } as const;

type ChatViewerControlsProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Horizontal budget for the toolbar row from the viewer layout (e.g. canvas container width minus gutter).
   * Must not be the toolbar element's own width — use a parent measurement so overflow can restore when widened.
   */
  readonly availableWidth?: number;
};

export function ChatViewerControls({
  className,
  availableWidth,
  ...props
}: ChatViewerControlsProps): React.JSX.Element {
  const is2dGeometry = useGraphicsSelector((state) =>
    state.context.geometries.some((geometry) => geometry.format === 'svg'),
  );
  const controlItems = is2dGeometry ? controlItems2d : controlItems3d;
  const { visibleIds, overflowIds, isCompact } = useToolbarOverflow(controlItems, availableWidth, overflowOptions);

  const overflowControls = useMemo(() => {
    if (overflowIds.size === 0) {
      return undefined;
    }

    return (
      <>
        {overflowIds.has('capture') && <CaptureViewOverflowControl />}
        {overflowIds.has('reset') && <ResetCameraOverflowControl />}
        {overflowIds.has('measure') && <MeasureOverflowControl />}
        {overflowIds.has('section') && <SectionViewOverflowControl />}
        {overflowIds.has('grid') && <GridOverflowControl />}
        {overflowIds.has('fov') && !is2dGeometry && <FovOverflowControl />}
      </>
    );
  }, [overflowIds, is2dGeometry]);

  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {visibleIds.has('fov') && !is2dGeometry && (
        <FovControl className={isCompact ? 'w-30' : 'w-50'} isCompact={isCompact} />
      )}
      {visibleIds.has('grid') && <GridSizeIndicator />}
      {visibleIds.has('section') && <SectionViewControl />}
      {visibleIds.has('measure') && <MeasureControl />}
      {visibleIds.has('reset') && <ResetCameraControl />}
      {visibleIds.has('capture') && <CaptureViewControl />}
      <ViewerSettings overflowControls={overflowControls} />
    </div>
  );
}
