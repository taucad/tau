import { ClippingPlaneControl } from '#components/geometry/cad/clipping-plane-control.js';
import { FovControl } from '#components/geometry/cad/fov-control.js';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';
import { ResetCameraControl } from '#components/geometry/cad/reset-camera-control.js';
import { cn } from '#utils/ui.js';

export function ChatViewerControls({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <FovControl defaultAngle={60} className="w-60" />
      <GridSizeIndicator />
      <ClippingPlaneControl />
      <ResetCameraControl />
    </div>
  );
}
