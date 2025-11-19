import { memo } from 'react';
import { useSelector } from '@xstate/react';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { useBuild } from '#hooks/use-build.js';

export const ChatViewer = memo(function () {
  const { cadRef: cadActor, graphicsRef: graphicsActor } = useBuild();

  // Combine selectors to reduce re-renders. By using a single selector with
  // a custom equality function, we only re-render when actual values change.
  const geometries = useSelector(
    cadActor,
    (state) => state.context.geometries,
    (a, b) => a === b,
  );

  const graphicsState = useSelector(
    graphicsActor,
    (state) => ({
      enableSurfaces: state.context.enableSurfaces,
      enableLines: state.context.enableLines,
      enableGizmo: state.context.enableGizmo,
      enableGrid: state.context.enableGrid,
      enableAxes: state.context.enableAxes,
      enableMatcap: state.context.enableMatcap,
    }),
    (a, b) =>
      a.enableSurfaces === b.enableSurfaces &&
      a.enableLines === b.enableLines &&
      a.enableGizmo === b.enableGizmo &&
      a.enableGrid === b.enableGrid &&
      a.enableAxes === b.enableAxes &&
      a.enableMatcap === b.enableMatcap,
  );

  return (
    <CadViewer
      enableZoom
      enablePan
      enableGizmo={graphicsState.enableGizmo}
      enableGrid={graphicsState.enableGrid}
      enableAxes={graphicsState.enableAxes}
      enableSurfaces={graphicsState.enableSurfaces}
      enableLines={graphicsState.enableLines}
      enableMatcap={graphicsState.enableMatcap}
      geometries={geometries}
      gizmoContainer="#viewport-gizmo-container"
    />
  );
});
