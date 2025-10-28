import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';
import { FovControl } from '#components/geometry/cad/fov-control.js';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';
import { ResetCameraControl } from '#components/geometry/cad/reset-camera-control.js';
import { cn } from '#utils/ui.utils.js';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';
import { SettingsControl } from '#components/geometry/cad/settings-control.js';

export function ChatViewerControls({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <FovControl defaultAngle={60} className="w-60" />
      <GridSizeIndicator />
      <SectionViewControl />
      <MeasureControl />
      <ResetCameraControl />
      <SettingsControl />
    </div>
  );
}
