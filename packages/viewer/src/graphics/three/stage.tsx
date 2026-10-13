import React from 'react';
import type { ReactNode } from 'react';
import type * as THREE from 'three';
import { flushSync } from '@react-three/fiber';
import { resolveMetersPerRenderUnit } from '@taucad/spatial';
import { createThreeRenderMatrix } from '@taucad/three/spatial';
import { Lights } from '#graphics/three/react/lights.jsx';
import type { SectionCertification } from '#graphics/three/react/section-contour-fill.jsx';
import { SectionClippingGroup } from '#graphics/three/react/section-clipping-group.jsx';
import { useLiveSectionCutSet, useSectionPieces, useSectionStripes } from '#graphics/three/use-section-view.js';
import { useGeometryBounds } from '#graphics/three/use-geometry-bounds.js';
import { useCameraFraming } from '#graphics/three/use-camera-framing.js';
import { defaultStageOptions } from '#graphics/three/stage-options.js';
import type { StageOptions } from '#graphics/three/stage-options.js';
import {
  useGraphics,
  useGraphicsSelector,
  useRenderFrame,
  useRenderFrameRetarget,
  useSetRenderFrame,
} from '#hooks/use-graphics.jsx';
import { createSectionViewSafeSnapshotStore } from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionViewSafeSnapshotStore } from '#graphics/three/utils/section-view-safe-snapshot.js';
import { selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import { useViewerEnvironment, useViewerFeature } from '#environment/viewer-environment.jsx';

const SectionContourFills = React.lazy(async () => {
  const module = await import('#graphics/three/react/section-contour-fill.jsx');
  return { default: module.SectionContourFills };
});

type StageProperties = {
  readonly children: ReactNode;
  readonly stageOptions?: StageOptions;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

type SectionViewSceneProperties = {
  // oxlint-disable-next-line typescript/no-restricted-types -- valid React ref type
  readonly innerRef: React.RefObject<THREE.Group | null>;
  readonly snapshotRef: React.RefObject<SectionViewSafeSnapshotStore>;
  readonly children: ReactNode;
};

/**
 * Section clipping and caps around the stage's model. The section view is read here rather than in
 * `Stage`, so a cut step re-renders this subtree but not `Stage`, whose re-render would hand the
 * clipping group a new child element and make it re-traverse the model.
 *
 * The caps certify the live cut list, and the clip removes only the committed one. The caps report a certification
 * from their frame callback, which runs before the clip's; flushing it here re-renders the clip with the committed
 * pieces within that frame, so the clip and the caps never draw different cut lists.
 * @public
 */
export function SectionViewScene({ innerRef, snapshotRef, children }: SectionViewSceneProperties): React.JSX.Element {
  const graphicsActor = useGraphics();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const liveCutSet = useLiveSectionCutSet();
  const committedPieces = useSectionPieces();
  const { stripeFrequency, stripeWidth } = useSectionStripes();
  const certify = React.useCallback(
    (payload: SectionCertification): void => {
      flushSync(() => {
        graphicsActor.send({ type: 'setSectionCertification', payload });
      });
    },
    [graphicsActor],
  );

  return (
    <>
      <SectionClippingGroup innerRef={innerRef} pieces={committedPieces}>
        {children}
      </SectionClippingGroup>
      <React.Suspense fallback={null}>
        {isSectionViewActive ? (
          <SectionContourFills
            cutSet={liveCutSet}
            enabled={isSectionViewActive}
            innerRef={innerRef}
            snapshotRef={snapshotRef}
            stripeFrequency={stripeFrequency}
            stripeWidth={stripeWidth}
            onCertify={certify}
          />
        ) : null}
      </React.Suspense>
    </>
  );
}

/**
 * The scene root around the model: it sets the render frame from the geometry's bounds, frames the camera, applies section clipping and caps, and adds the lights.
 *
 * @param props - The model as children, the stage options and the group's attributes.
 * @returns The stage group.
 * @public
 */
export function Stage({
  children,
  stageOptions = defaultStageOptions,
  ...properties
}: StageProperties): React.JSX.Element {
  const outer = React.useRef<THREE.Group>(null);
  // oxlint-disable-next-line typescript/no-restricted-types -- valid React ref type
  const innerRef = React.useRef<THREE.Group | null>(null);
  const [sectionSnapshot] = React.useState(createSectionViewSafeSnapshotStore);
  const sectionSnapshotRef = React.useRef(sectionSnapshot);

  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const geometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);

  // Gate the e2e test bridge behind the debug flag so it is never mounted or
  // executed in prod. The e2e suite runs with `TAU_DEBUG=true` (see
  // apps/ui-e2e/global-setup.ts), which resolves this flag on.
  const isTauDebugEnabled = useViewerFeature('tauDebug');
  const { debugStageBridge: DebugStageBridge } = useViewerEnvironment();

  const renderFrame = useRenderFrame();
  const setRenderFrame = useSetRenderFrame();
  const initializedGeometryRef = React.useRef<{
    key: string | undefined;
    initialized: boolean;
  }>({
    key: undefined,
    initialized: false,
  });
  const retargetScene = React.useCallback((nextRenderFrame: typeof renderFrame): void => {
    if (!outer.current) {
      return;
    }
    outer.current.matrix.copy(createThreeRenderMatrix(nextRenderFrame));
    outer.current.matrixWorldNeedsUpdate = true;
    outer.current.updateWorldMatrix(true, true);
  }, []);
  useRenderFrameRetarget(retargetScene);

  const { geometryRadius, geometryCenter, geometryBounds, isPoseUpdate } = useGeometryBounds(innerRef, outer);

  React.useLayoutEffect(() => {
    if (
      geometryRadius <= 0 ||
      (initializedGeometryRef.current.initialized && initializedGeometryRef.current.key === geometryKey)
    ) {
      return;
    }
    initializedGeometryRef.current = { key: geometryKey, initialized: true };
    setRenderFrame({
      anchorFrameId: renderFrame.anchorFrameId,
      originMeters: [geometryCenter.x, geometryCenter.y, geometryCenter.z],
      metersPerRenderUnit: resolveMetersPerRenderUnit({
        characteristicLengthMeters: geometryRadius * 2,
      }),
    });
  }, [geometryCenter, geometryKey, geometryRadius, renderFrame.anchorFrameId, setRenderFrame]);

  useCameraFraming({
    geometryRadius,
    geometryCenter,
    geometryBounds,
    isPoseUpdate,
    stageOptions,
  });

  return (
    <group {...properties}>
      <React.Suspense fallback={null}>
        {isTauDebugEnabled && DebugStageBridge ? <DebugStageBridge isGeometryFramed={geometryRadius > 0} /> : undefined}
      </React.Suspense>
      <group ref={outer} matrixAutoUpdate={false}>
        <SectionViewScene innerRef={innerRef} snapshotRef={sectionSnapshotRef}>
          <group ref={innerRef}>{children}</group>
        </SectionViewScene>
      </group>
      <Lights
        settings={stageOptions.lighting}
        enableMatcap={enableMatcap}
        sceneRadius={geometryRadius > 0 ? geometryRadius / renderFrame.metersPerRenderUnit : 0}
        upDirection={upDirection}
      />
    </group>
  );
}
