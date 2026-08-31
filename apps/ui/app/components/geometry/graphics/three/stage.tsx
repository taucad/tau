import React from 'react';
import type { ReactNode } from 'react';
import type * as THREE from 'three';
import { resolveMetersPerRenderUnit } from '@taucad/spatial';
import { createThreeRenderMatrix } from '@taucad/three/spatial';
import { Lights } from '#components/geometry/graphics/three/react/lights.js';
import { SectionContourFills } from '#components/geometry/graphics/three/react/section-contour-fill.js';
import { SectionClippingGroup } from '#components/geometry/graphics/three/react/section-clipping-group.js';
import { SectionViewTestBridge } from '#components/geometry/graphics/three/react/section-view-test-bridge.js';
import { useFeature } from '#flags/use-feature.js';
import { useSectionView } from '#components/geometry/graphics/three/use-section-view.js';
import { useGeometryBounds } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { useCameraFraming } from '#components/geometry/graphics/three/use-camera-framing.js';
import { useGraphicsSelector, useRenderFrame, useRenderFrameRetarget, useSetRenderFrame } from '#hooks/use-graphics.js';
import { createSectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

export type StageOptions = {
  /** Fractional outer margin applied by projected-corner fitting. */
  fitMargin?: number;
  rotation?: {
    /**
     * The initial z-axis rotation of the camera in radians.
     */
    side?: number;

    /**
     * The initial xy-plane rotation of the camera in radians.
     */
    vertical?: number;
  };
};

// Default configuration constants
export const defaultStageOptions = {
  fitMargin: 0.1,
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 6, // Default rotation is 30 degrees upwards
  },
} as const satisfies StageOptions;

type StageProperties = {
  readonly children: ReactNode;
  readonly stageOptions?: StageOptions;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({
  children,
  stageOptions = defaultStageOptions,
  ...properties
}: StageProperties): React.JSX.Element {
  const outer = React.useRef<THREE.Group>(null);
  // oxlint-disable-next-line typescript/no-restricted-types -- valid React ref type
  const innerRef = React.useRef<THREE.Group | null>(null);
  const sectionSnapshotRef = React.useRef(createSectionViewSafeSnapshotStore());

  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const geometryKey = useGraphicsSelector((state) => state.context.geometryKey);
  const environmentPreset = useGraphicsSelector((state) => state.context.environmentPreset);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);

  // Gate the e2e test bridge behind the debug flag so it is never mounted or
  // executed in prod. The e2e suite runs with `TAU_DEBUG=true` (see
  // apps/ui-e2e/global-setup.ts), which resolves this flag on.
  const isTauDebugEnabled = useFeature('tauDebug');

  const sectionView = useSectionView();
  const renderFrame = useRenderFrame();
  const setRenderFrame = useSetRenderFrame();
  const initializedGeometryRef = React.useRef<{ key: string | undefined; initialized: boolean }>({
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

  const { geometryRadius, geometryCenter, geometryBounds } = useGeometryBounds(innerRef, outer);

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
      metersPerRenderUnit: resolveMetersPerRenderUnit({ characteristicLengthMeters: geometryRadius * 2 }),
    });
  }, [geometryCenter, geometryKey, geometryRadius, renderFrame.anchorFrameId, setRenderFrame]);

  useCameraFraming({ geometryRadius, geometryCenter, geometryBounds, stageOptions });

  return (
    <group {...properties}>
      {isTauDebugEnabled ? <SectionViewTestBridge isGeometryFramed={geometryRadius > 0} /> : undefined}
      <group ref={outer} matrixAutoUpdate={false}>
        <SectionClippingGroup
          enableLines={sectionView.enableLines}
          enableMesh={sectionView.enableMesh}
          enabled={sectionView.isActive}
          innerRef={innerRef}
          plane={sectionView.plane}
          snapshotRef={sectionSnapshotRef}
        >
          <group ref={innerRef}>{children}</group>
        </SectionClippingGroup>
        <SectionContourFills
          enabled={sectionView.isActive && sectionView.enableMesh}
          innerRef={innerRef}
          plane={sectionView.plane}
          snapshotRef={sectionSnapshotRef}
          stripeFrequency={sectionView.stripeFrequency}
          stripeWidth={sectionView.stripeWidth}
        />
      </group>
      <Lights
        enableMatcap={enableMatcap}
        environmentPreset={environmentPreset}
        sceneRadius={geometryRadius > 0 ? geometryRadius / renderFrame.metersPerRenderUnit : 0}
        upDirection={upDirection}
      />
    </group>
  );
}
