import { memo } from 'react';
import { useSelector } from '@xstate/react';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { ChatViewerError } from '~/routes/builds_.$id/chat-viewer-error.js';
import { ChatViewerControls } from '~/routes/builds_.$id/chat-viewer-controls.js';

export const ChatViewer = memo(function () {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);

  return (
    <>
      <div className="relative size-full">
        <CadViewer enableGizmo enableGrid enableZoom enableAxesHelper shapes={shapes} zoomLevel={1.25} />
        <ChatViewerError />
      </div>
      <ChatViewerControls />
    </>
  );
});
