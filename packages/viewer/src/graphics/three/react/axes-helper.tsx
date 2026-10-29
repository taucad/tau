import * as THREE from 'three';
import { Line } from '@react-three/drei';
import React from 'react';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { Line2 as Line2WebGpu } from 'three/addons/lines/webgpu/Line2.js';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { Line2NodeMaterial } from '#graphics/three/materials/line2.material.js';
import { axesHelperColors, axesHelperOpacity } from '#graphics/three/overlay-colors.constants.js';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { viewportRenderTiers } from '#graphics/three/utils/render-order.utils.js';
import { useRenderFrame } from '#hooks/use-graphics.jsx';

/**
 * Shared origin used as one endpoint of the drei `<Line>` points array on the WebGL
 * branch. Hoisting it keeps each per-axis `points={...}` literal stable.
 */
const axisOrigin = new THREE.Vector3(0, 0, 0);

type CustomAxesHelperProps = {
  /**
   * The color of the X axis
   * @default 'red'
   */
  readonly xAxisColor?: string;
  /**
   * The color of the Y axis
   * @default 'green'
   */
  readonly yAxisColor?: string;
  /**
   * The color of the Z axis
   * @default 'blue'
   */
  readonly zAxisColor?: string;
  /**
   * The thickness of the axes
   * @default 5
   */
  readonly thickness?: number;
};

/** Finite render-local proxy long enough to leave every supported normalized viewport. */
export const axesProxyLengthRenderUnits = 50_000;

type AxisSegmentDefinition = Readonly<{
  color: string;
  id: 'x' | 'y' | 'z';
  /** End point of the positive half of the axis (e.g. `[size, 0, 0]` for X). */
  positiveEnd: THREE.Vector3;
}>;

type AxesWebGpuFatLineProps = Readonly<{
  color: string;
  opacity: number;
  /** Positive-half endpoint in local space (e.g. `[size, 0, 0]` for X). */
  positiveEnd: THREE.Vector3;
  thickness: number;
}>;

type FatLineResources = Readonly<{
  geometry: LineGeometry;
  group: THREE.Group;
  material: Line2NodeMaterial;
}>;

/**
 * Persistent WebGPU fat-line component for a single axis. Exported for the persistence
 * regression guard in `axes-helper-webgpu.test.tsx` — internal callers must not
 * instantiate it directly; route through `AxesHelper`.
 *
 * Owns one persistent `Line2NodeMaterial` and `Line2WebGpu` mesh per axis.
 *
 * Architectural rules enforced here:
 *
 * - The `LineGeometry` is initialised exactly once; Three.js issue
 *   [#31056](https://github.com/mrdoob/three.js/issues/31056) documents why replacing
 *   its position attribute after first use is unsafe with `WebGPURenderer`.
 * Compile on the active frame target. Detached warmup allocates an unused output target
 * and prepares the wrong render context; ordinary draws retain the compiled material.
 */
export function AxesWebGpuFatLine({
  color,
  opacity,
  positiveEnd,
  thickness,
}: AxesWebGpuFatLineProps): React.JSX.Element {
  const resources = React.useMemo<FatLineResources>(() => {
    const material = new Line2NodeMaterial({
      color: new THREE.Color(color),
      depthTest: true,
      depthWrite: false,
      linewidth: thickness,
      opacity,
      transparent: true,
      worldUnits: false,
    });

    const geometry = new LineGeometry();
    geometry.setPositions([0, 0, 0, positiveEnd.x, positiveEnd.y, positiveEnd.z]);

    const line = new Line2WebGpu(geometry, material);
    line.renderOrder = viewportRenderTiers.viewportGizmo;

    const group = new THREE.Group();
    group.renderOrder = viewportRenderTiers.viewportGizmo;
    group.add(line);

    return { geometry, group, material };
  }, [color, opacity, positiveEnd, thickness]);

  React.useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );

  return <primitive object={resources.group} />;
}

export function AxesHelper({
  xAxisColor = axesHelperColors.x,
  yAxisColor = axesHelperColors.y,
  zAxisColor = axesHelperColors.z,
  thickness = 1.25,
}: CustomAxesHelperProps): React.JSX.Element {
  const graphicsBackend = useThreeGraphicsBackend();
  const renderFrame = useRenderFrame();
  const physicalOrigin = React.useMemo(
    () => toThreeRenderPoint({ renderFrame, pointMeters: [0, 0, 0] }),
    [renderFrame],
  );

  // Single allocation site for the axis descriptor table. Keyed only on `size` and the
  // three colors.
  const axes = React.useMemo<readonly AxisSegmentDefinition[]>(() => {
    return [
      {
        color: xAxisColor,
        id: 'x',
        positiveEnd: new THREE.Vector3(axesProxyLengthRenderUnits, 0, 0),
      },
      {
        color: yAxisColor,
        id: 'y',
        positiveEnd: new THREE.Vector3(0, axesProxyLengthRenderUnits, 0),
      },
      {
        color: zAxisColor,
        id: 'z',
        positiveEnd: new THREE.Vector3(0, 0, axesProxyLengthRenderUnits),
      },
    ];
  }, [xAxisColor, yAxisColor, zAxisColor]);

  return (
    <group position={physicalOrigin}>
      {axes.map((axis) => {
        return (
          <React.Fragment key={axis.id}>
            {graphicsBackend === 'webgpu' ? (
              <AxesWebGpuFatLine
                color={axis.color}
                opacity={axesHelperOpacity}
                positiveEnd={axis.positiveEnd}
                thickness={thickness}
              />
            ) : (
              <Line
                color={axis.color}
                lineWidth={thickness}
                opacity={axesHelperOpacity}
                points={[axisOrigin, axis.positiveEnd]}
                renderOrder={viewportRenderTiers.viewportGizmo}
                toneMapped={false}
                transparent
              />
            )}
          </React.Fragment>
        );
      })}
    </group>
  );
}
