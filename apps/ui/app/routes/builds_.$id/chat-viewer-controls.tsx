import type { JSX } from 'react';
import { FovControl } from '~/components/geometry/cad/fov-control.js';
import { GridSizeIndicator } from '~/components/geometry/cad/grid-control.js';
import { ResetCameraControl } from '~/components/geometry/cad/reset-camera-control.js';

export function ChatViewerControls(): JSX.Element {
  return (
    <div className="absolute bottom-0 left-0 z-10 m-2">
      <div className="flex items-center gap-2">
        <FovControl defaultAngle={60} className="w-60" />
        <GridSizeIndicator />
        <ResetCameraControl />
      </div>
    </div>
  );
}
