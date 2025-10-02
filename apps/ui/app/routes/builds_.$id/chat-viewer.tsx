import { memo } from 'react';
import { useSelector } from '@xstate/react';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { cadActor } from '#routes/builds_.$id/cad-actor.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';

export const ChatViewer = memo(function () {
  const geometries = useSelector(cadActor, (state) => state.context.geometries);

  // Get all visibility states from graphics machine
  const enableSurfaces = useSelector(graphicsActor, (state) => state.context.enableSurfaces);
  const enableLines = useSelector(graphicsActor, (state) => state.context.enableLines);
  const enableGizmo = useSelector(graphicsActor, (state) => state.context.enableGizmo);
  const enableGrid = useSelector(graphicsActor, (state) => state.context.enableGrid);
  const enableAxes = useSelector(graphicsActor, (state) => state.context.enableAxes);

  return (
    <CadViewer
      enableZoom
      enablePan
      enableGizmo={enableGizmo}
      enableGrid={enableGrid}
      enableAxes={enableAxes}
      enableSurfaces={enableSurfaces}
      enableLines={enableLines}
      geometries={geometries}
      gizmoClassName="right-[calc((var(--right-panel-size)+var(--left-panel-size))/2+var(--spacing)*1)]!"
    />
  );
});
