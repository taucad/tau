import { memo } from 'react';
import { useSelector } from '@xstate/react';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import { ChatViewerStatus } from '~/routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '~/routes/builds_.$id/chat-viewer-controls.js';
import { HammerAnimation } from '~/components/hammer-animation.js';
import { CameraSettings } from '~/components/geometry/cad/camera-settings.js';

export const ChatViewer = memo(function () {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const status = useSelector(cadActor, (state) => state.value);

  // Get all visibility states from graphics machine
  const withMesh = useSelector(graphicsActor, (state) => state.context.withMesh);
  const withLines = useSelector(graphicsActor, (state) => state.context.withLines);
  const withGizmo = useSelector(graphicsActor, (state) => state.context.withGizmo);
  const withGrid = useSelector(graphicsActor, (state) => state.context.withGrid);
  const withAxesHelper = useSelector(graphicsActor, (state) => state.context.withAxesHelper);

  return (
    <>
      <div className="relative size-full">
        {['initializing', 'booting'].includes(status) ? (
          <div className="flex size-full items-center justify-center">
            <div className="rounded-4xl border bg-neutral/20 p-5 pl-3">
              <HammerAnimation className="size-25" />
            </div>
          </div>
        ) : (
          <CadViewer
            enableZoom
            enableGizmo={withGizmo}
            enableGrid={withGrid}
            enableAxesHelper={withAxesHelper}
            shapes={shapes}
            withMesh={withMesh}
            withLines={withLines}
          />
        )}
        <CameraSettings className="absolute top-2 right-2" />
        <ChatViewerStatus />
      </div>
      <ChatViewerControls />
    </>
  );
});
