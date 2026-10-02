import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import React, { Fragment } from 'react';
import { LineGeometry } from 'three/addons';
import { Line2 as Line2WebGpu } from 'three/addons/lines/webgpu/Line2.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import { axesHelperColors, axesHelperOpacity } from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { topMostRenderOrder } from '#components/geometry/graphics/three/utils/render-order.utils.js';

/** Local +X axis used to orient pick hitboxes along arbitrary axis rays. */
const canonicalAxisDirection = new THREE.Vector3(1, 0, 0);

/**
 * Shared origin used as one endpoint of the drei `<Line>` points array on the WebGL
 * branch. Hoisting it to a module-level constant keeps each per-axis `points={...}`
 * literal stable across renders aside from the changing far endpoint.
 */
const axisOrigin = new THREE.Vector3(0, 0, 0);

type CustomAxesHelperProps = {
  /**
   * The size of the axes
   * @default 5000
   */
  readonly size?: number;
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
  /**
   * The thickness of the axes when hovered
   * @default 2
   */
  readonly hoverThickness?: number;
};

type AxisId = 'x' | 'y' | 'z';

type AxisSegmentDefinition = Readonly<{
  color: string;
  id: AxisId;
  /** End point of the negative half of the axis (e.g. `[-size, 0, 0]` for X). */
  negativeEnd: THREE.Vector3;
  /** End point of the positive half of the axis (e.g. `[size, 0, 0]` for X). */
  positiveEnd: THREE.Vector3;
  /** Local +X → axis-direction rotation used to orient pick hitboxes. Stable per axis. */
  pickQuaternion: THREE.Quaternion;
  /** Length of the visible line + pick hitbox when not hovered (`origin → positiveEnd`). */
  halfLength: number;
  /** Midpoint tuple of the unhovered hit hitbox (`origin → positiveEnd`). */
  halfMidpoint: readonly [number, number, number];
  /** Length of the visible line + pick hitbox when hovered (`negativeEnd → positiveEnd`). */
  fullLength: number;
  /** Midpoint tuple of the hovered hit hitbox (`negativeEnd → positiveEnd`). */
  fullMidpoint: readonly [number, number, number];
}>;

function axisPickRadial(length: number, thickness: number): number {
  return Math.min(Math.max(length * 0.004, thickness * 16, 6), length * 0.06);
}

type AxisPickHitboxProps = Readonly<{
  length: number;
  midpoint: readonly [number, number, number];
  quaternion: THREE.Quaternion;
  radial: number;
  renderOrder: number;
  onPointerOut: () => void;
  onPointerOver: () => void;
}>;

function AxisPickHitbox({
  length,
  midpoint,
  quaternion,
  radial,
  renderOrder,
  onPointerOut,
  onPointerOver,
}: AxisPickHitboxProps): React.JSX.Element {
  return (
    // oxlint-disable-next-line tau-lint/no-hardcoded-color -- invisible raycast hull
    <mesh
      quaternion={quaternion}
      position={midpoint}
      renderOrder={renderOrder}
      visible
      onPointerOut={(event) => {
        event.stopPropagation();
        onPointerOut();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onPointerOver();
      }}
    >
      <boxGeometry args={[length, radial, radial]} />
      {/* oxlint-disable-next-line tau-lint/no-hardcoded-color -- fully transparent hull; diffuse color irrelevant */}
      <meshBasicMaterial depthTest={false} depthWrite={false} opacity={0} transparent />
    </mesh>
  );
}

type AxesWebGpuFatLineProps = Readonly<{
  color: string;
  hoverThickness: number;
  isHovered: boolean;
  /** Negative-half endpoint in local space (e.g. `[-size, 0, 0]` for X). */
  negativeEnd: THREE.Vector3;
  opacity: number;
  /** Positive-half endpoint in local space (e.g. `[size, 0, 0]` for X). */
  positiveEnd: THREE.Vector3;
  thickness: number;
}>;

type FatLineResources = Readonly<{
  group: THREE.Group;
  material: Line2NodeMaterial;
  negativeLine: Line2WebGpu;
  positiveGeometry: LineGeometry;
  negativeGeometry: LineGeometry;
}>;

/**
 * Persistent WebGPU fat-line component for a single axis. Exported for the persistence
 * regression guard in `axes-helper-webgpu.test.tsx` — internal callers must not
 * instantiate it directly; route through `AxesHelper`.
 *
 * Owns one `Line2NodeMaterial` and **two** `Line2WebGpu` meshes per axis (positive half +
 * negative half), constructed once on mount. Hover transitions mutate `material.linewidth`
 * and `negativeLine.visible` imperatively through `useLayoutEffect` — never reconstructing
 * the material or geometry. This eliminates the per-hover WebGPU pipeline recompile that
 * caused the "axis line vanishes on hover" frame gap (smoking gun: each
 * `new Line2NodeMaterial(...)` forces `createRenderPipelineAsync` and skips draws until
 * the new pipeline resolves; see `docs/research/webgpu-axes-hover-pipeline-stall.md`).
 *
 * Architectural rules enforced here:
 *
 * - **Two persistent geometries**, not one geometry mutated via `LineGeometry.setPositions`.
 *   Three.js issue [#31056](https://github.com/mrdoob/three.js/issues/31056) documents that
 *   the second `setPositions()` call on a `Line2`/`LineSegmentsGeometry` silently has no
 *   effect on `WebGPURenderer`: `setPositions` internally calls `setAttribute()` which
 *   recreates the underlying `BufferAttribute` rather than updating it, and the WebGPU
 *   backend caches the original attribute handle. Each `LineGeometry` here is initialised
 *   exactly once on construction.
 * - **Policy Rule 4** (`webgpu-shader-and-pipeline-policy.md`): hover-driven state routes
 *   through uniform mutation (`material.linewidth`) and a boolean visibility flag
 *   (`negativeLine.visible`), not through props that drive the material constructor.
 * - **Policy Rule 8** (pipeline budget): each `Line2NodeMaterial` warms one render
 *   pipeline per `Line2WebGpu` mesh. Three axes × two halves = six pipelines total for the
 *   whole `AxesHelper`, all warmed once on mount and cached for the component's React
 *   lifetime.
 * - **Policy Rule 13** (pipeline pre-warm): the second `useLayoutEffect` invokes
 *   `gl.compileAsync(group, camera)` before the first `useFrame` tick, mirroring the
 *   warmup pattern in `post-processing-webgpu.tsx`, so cold-cache mounts do not skip the
 *   first frame.
 */
export function AxesWebGpuFatLine({
  color,
  hoverThickness,
  isHovered,
  negativeEnd,
  opacity,
  positiveEnd,
  thickness,
}: AxesWebGpuFatLineProps): React.JSX.Element {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  const resources = React.useMemo<FatLineResources>(() => {
    const material = new Line2NodeMaterial({
      color: new THREE.Color(color),
      depthTest: true,
      depthWrite: false,
      // Initialised to `thickness`; the imperative `useLayoutEffect` below promotes it to
      // `hoverThickness` whenever the axis is hovered. Mutating this uniform is a single
      // property write — no shader recompile (Policy Rule 4).
      linewidth: thickness,
      opacity,
      transparent: true,
      worldUnits: false,
    });

    // Two persistent geometries, each initialised exactly once via `setPositions`. See
    // class JSDoc above for the three.js #31056 rationale that forbids mutating positions
    // on `LineSegmentsGeometry` after the first call.
    const positiveGeometry = new LineGeometry();
    positiveGeometry.setPositions([0, 0, 0, positiveEnd.x, positiveEnd.y, positiveEnd.z]);

    const negativeGeometry = new LineGeometry();
    negativeGeometry.setPositions([negativeEnd.x, negativeEnd.y, negativeEnd.z, 0, 0, 0]);

    const positiveLine = new Line2WebGpu(positiveGeometry, material);
    positiveLine.renderOrder = topMostRenderOrder;

    const negativeLine = new Line2WebGpu(negativeGeometry, material);
    negativeLine.renderOrder = topMostRenderOrder;
    negativeLine.visible = false;

    const group = new THREE.Group();
    group.renderOrder = topMostRenderOrder;
    group.add(positiveLine);
    group.add(negativeLine);

    return { group, material, negativeGeometry, negativeLine, positiveGeometry };
  }, [color, negativeEnd, opacity, positiveEnd, thickness]);

  // Imperative hover mutation. Runs synchronously after DOM commit so the first frame
  // after a hover transition observes the correct uniform/visibility state without a
  // material reconstruction.
  React.useLayoutEffect(() => {
    resources.material.linewidth = isHovered ? hoverThickness : thickness;
    resources.negativeLine.visible = isHovered;
    invalidate();
  }, [hoverThickness, invalidate, isHovered, resources, thickness]);

  // Pre-warm the WebGPU render pipeline so the first draw after mount does not skip
  // while `createRenderPipelineAsync` resolves (Policy Rule 13). Mirrors the warmup
  // pattern in `post-processing-webgpu.tsx`.
  React.useLayoutEffect(() => {
    const cancellation = { cancelled: false };
    // `compileAsync` is only available on `WebGPURenderer`; the WebGL branch never mounts
    // this component, but we guard defensively in case a renderer stub is supplied (tests
    // override this; jsdom-driven harnesses never resolve a real compileAsync).
    const renderer = gl as unknown as {
      compileAsync?: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<unknown>;
    };
    const compile = renderer.compileAsync;
    if (typeof compile !== 'function') {
      return undefined;
    }

    // async-iife: bootstrap — useLayoutEffect cannot be async; the cancellation flag
    // ensures a teardown before resolution is a no-op.
    void (async () => {
      try {
        await compile.call(renderer, resources.group, camera);
      } catch (error) {
        console.error('AxesWebGpuFatLine pipeline warm-up failed', error);
        return;
      }
      if (cancellation.cancelled) {
        return;
      }
      invalidate();
    })();

    return () => {
      cancellation.cancelled = true;
    };
  }, [camera, gl, invalidate, resources]);

  React.useEffect(
    () => () => {
      resources.positiveGeometry.dispose();
      resources.negativeGeometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );

  return <primitive object={resources.group} />;
}

export function AxesHelper({
  size = 50_000,
  xAxisColor = axesHelperColors.x,
  yAxisColor = axesHelperColors.y,
  zAxisColor = axesHelperColors.z,
  thickness = 1.25,
  hoverThickness = 2,
}: CustomAxesHelperProps): React.JSX.Element {
  const [hoveredAxis, setHoveredAxis] = React.useState<AxisId | undefined>(undefined);
  const graphicsBackend = useThreeGraphicsBackend();

  // Single allocation site for the axis descriptor table. Keyed only on `size` and the
  // three colors; hover state does NOT invalidate this memo (hover transitions go through
  // imperative mutations downstream, not through prop changes that would force a
  // material/geometry rebuild).
  const axes = React.useMemo<readonly AxisSegmentDefinition[]>(() => {
    // Stable per-axis quaternions: each axis's direction is constant (`+X`, `+Y`, `+Z`)
    // regardless of hover state, since both halves share the same line. Pre-computing
    // here eliminates the `new THREE.Quaternion().setFromUnitVectors(...)` allocation
    // that previously fired on every render.
    const xPickQuaternion = new THREE.Quaternion();
    const yPickQuaternion = new THREE.Quaternion().setFromUnitVectors(
      canonicalAxisDirection,
      new THREE.Vector3(0, 1, 0),
    );
    const zPickQuaternion = new THREE.Quaternion().setFromUnitVectors(
      canonicalAxisDirection,
      new THREE.Vector3(0, 0, 1),
    );

    return [
      {
        color: xAxisColor,
        fullLength: size * 2,
        fullMidpoint: [0, 0, 0],
        halfLength: size,
        halfMidpoint: [size / 2, 0, 0],
        id: 'x',
        negativeEnd: new THREE.Vector3(-size, 0, 0),
        pickQuaternion: xPickQuaternion,
        positiveEnd: new THREE.Vector3(size, 0, 0),
      },
      {
        color: yAxisColor,
        fullLength: size * 2,
        fullMidpoint: [0, 0, 0],
        halfLength: size,
        halfMidpoint: [0, size / 2, 0],
        id: 'y',
        negativeEnd: new THREE.Vector3(0, -size, 0),
        pickQuaternion: yPickQuaternion,
        positiveEnd: new THREE.Vector3(0, size, 0),
      },
      {
        color: zAxisColor,
        fullLength: size * 2,
        fullMidpoint: [0, 0, 0],
        halfLength: size,
        halfMidpoint: [0, 0, size / 2],
        id: 'z',
        negativeEnd: new THREE.Vector3(0, 0, -size),
        pickQuaternion: zPickQuaternion,
        positiveEnd: new THREE.Vector3(0, 0, size),
      },
    ];
  }, [size, xAxisColor, yAxisColor, zAxisColor]);

  return (
    <group userData={sceneTagData(sceneTag.previewOnly)}>
      {axes.map((axis) => {
        const isHovered = hoveredAxis === axis.id;
        const length = isHovered ? axis.fullLength : axis.halfLength;
        const midpoint = isHovered ? axis.fullMidpoint : axis.halfMidpoint;
        const pickRadial = axisPickRadial(length, thickness);

        return (
          <Fragment key={axis.id}>
            {graphicsBackend === 'webgpu' ? (
              <AxesWebGpuFatLine
                color={axis.color}
                hoverThickness={hoverThickness}
                isHovered={isHovered}
                negativeEnd={axis.negativeEnd}
                opacity={axesHelperOpacity}
                positiveEnd={axis.positiveEnd}
                thickness={thickness}
              />
            ) : (
              <Line
                color={axis.color}
                lineWidth={isHovered ? hoverThickness : thickness}
                opacity={axesHelperOpacity}
                points={isHovered ? [axis.negativeEnd, axis.positiveEnd] : [axisOrigin, axis.positiveEnd]}
                renderOrder={topMostRenderOrder}
                transparent
              />
            )}
            <AxisPickHitbox
              length={length}
              midpoint={midpoint}
              quaternion={axis.pickQuaternion}
              radial={pickRadial}
              renderOrder={topMostRenderOrder}
              onPointerOut={() => {
                setHoveredAxis(undefined);
              }}
              onPointerOver={() => {
                setHoveredAxis(axis.id);
              }}
            />
          </Fragment>
        );
      })}
    </group>
  );
}
