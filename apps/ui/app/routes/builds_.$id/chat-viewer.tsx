import { memo } from 'react';
import { useSelector } from '@xstate/react';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { ChatViewerStatus } from '~/routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '~/routes/builds_.$id/chat-viewer-controls.js';
import { HammerAnimation } from '~/components/hammer-animation.js';

export const ChatViewer = memo(function () {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const status = useSelector(cadActor, (state) => state.value);

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
          <CadViewer enableGizmo enableGrid enableZoom enableAxesHelper shapes={shapes} />
        )}
        <ChatViewerStatus />
      </div>
      <ChatViewerControls />
    </>
  );
});
