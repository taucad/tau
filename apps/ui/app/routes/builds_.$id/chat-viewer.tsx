import { memo } from 'react';
import { useSelector } from '@xstate/react';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import { ChatViewerStatus } from '~/routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '~/routes/builds_.$id/chat-viewer-controls.js';
import { HammerAnimation } from '~/components/hammer-animation.js';
import { SettingsControl } from '~/components/geometry/cad/settings-control.js';

export const ChatViewer = memo(function () {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const status = useSelector(cadActor, (state) => state.value);

  // Get all visibility states from graphics machine
  const enableSurface = useSelector(graphicsActor, (state) => state.context.enableSurface);
  const enableLines = useSelector(graphicsActor, (state) => state.context.enableLines);
  const enableGizmo = useSelector(graphicsActor, (state) => state.context.enableGizmo);
  const enableGrid = useSelector(graphicsActor, (state) => state.context.enableGrid);
  const enableAxes = useSelector(graphicsActor, (state) => state.context.enableAxes);

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
            enableGizmo={enableGizmo}
            enableGrid={enableGrid}
            enableAxes={enableAxes}
            enableSurface={enableSurface}
            enableLines={enableLines}
            shapes={shapes}
          />
        )}
        <SettingsControl className="absolute top-2 right-2" />
        <ChatViewerStatus />
      </div>
      <ChatViewerControls />
    </>
  );
});
