/* oxlint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree, useFrame } from '@react-three/fiber';
import type { GizmoAxisOptions, GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons';
import type { ReactNode } from 'react';
import { useColor } from '#hooks/use-color.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { createViewportGizmoCubeAxes } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import {
  resolveGizmoContainer,
  syncGizmoFov,
  useGizmoResizeSync,
} from '#components/geometry/graphics/three/utils/gizmo.utils.js';

type ViewportGizmoOnshapeProps = {
  readonly size?: number;
  /**
   * A container element or selector to append the gizmo to.
   *
   * When provided, the gizmo will be appended to this container instead of the renderer's parent.
   */
  readonly container?: HTMLElement | string;
  /**
   * Optional dependencies array that will be appended to the effect dependencies.
   * When any of these values change, the gizmo will be disposed and recreated.
   */
  readonly dependencies?: readonly unknown[];
};

const className = 'viewport-gizmo-onshape';
const emptyDependencies: readonly unknown[] = [];

export function ViewportGizmoOnshape({
  size = 96,
  container,
  dependencies = emptyDependencies,
}: ViewportGizmoOnshapeProps): ReactNode {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as OrbitControls;
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  const { serialized } = useColor();
  const { theme } = useTheme();

  // Subscribe to the viewport FOV from the per-view graphics machine
  const cameraFovAngle = useGraphicsSelector((state) => state.context.cameraFovAngle);

  const cameraFovAngleRef = useRef(cameraFovAngle);
  cameraFovAngleRef.current = cameraFovAngle;

  const gizmoRef = useRef<ViewportGizmo | undefined>(undefined);

  const graphicsBackendThree = useThreeGraphicsBackend();

  const handleChange = useCallback((): void => {
    invalidate();
  }, [invalidate]);

  useFrame(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) {
      return;
    }

    const supportsTone = 'toneMapping' in gl;
    const previousTone = supportsTone ? gl.toneMapping : undefined;
    if (supportsTone) {
      gl.toneMapping = THREE.NoToneMapping;
    }

    gizmo.render();

    if (supportsTone && previousTone !== undefined) {
      gl.toneMapping = previousTone;
    }
  }, 3);

  useGizmoResizeSync(gizmoRef);

  useEffect(() => {
    if (!camera || !gl || !controls) {
      return;
    }

    const containerToUse = resolveGizmoContainer(container, gl.domElement);
    if (!containerToUse) {
      return;
    }

    const backgroundColor = theme === Theme.DARK ? 0x44_44_44 : 0xcc_cc_cc;
    const faceConfig = {
      color: theme === Theme.DARK ? 0x33_33_33 : 0xdd_dd_dd,
      labelColor: theme === Theme.DARK ? 0xff_ff_ff : 0x00_00_00,
      hover: {
        color: serialized.hex,
      },
    } as const satisfies GizmoAxisOptions;
    const edgeConfig = {
      color: theme === Theme.DARK ? 0x55_55_55 : 0xee_ee_ee,
      opacity: 1,
      hover: {
        color: serialized.hex,
      },
    } as const satisfies GizmoAxisOptions;
    const cornerConfig = {
      ...faceConfig,
      color: theme === Theme.DARK ? 0x33_33_33 : 0xdd_dd_dd,
      hover: {
        color: serialized.hex,
      },
    } as const satisfies GizmoAxisOptions;

    const gizmoConfig: GizmoOptions = {
      type: 'cube',
      placement: 'bottom-right',
      size,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      resolution: 256,
      className,
      container: containerToUse,
      background: {
        color: backgroundColor,
        hover: { color: backgroundColor },
      },
      offset: {
        bottom: 0,
        right: 0,
      },
      corners: cornerConfig,
      edges: edgeConfig,
      right: faceConfig,
      top: faceConfig,
      front: faceConfig,
      back: faceConfig,
      left: faceConfig,
      bottom: faceConfig,
    };

    const gizmo = new ViewportGizmo(camera, gl, gizmoConfig);
    gizmoRef.current = gizmo;

    syncGizmoFov(gizmo, cameraFovAngleRef.current);

    gizmo.addEventListener('change', handleChange);
    gizmo.addEventListener('hoverchange', handleChange);

    gizmo.scale.multiplyScalar(0.7);
    gizmo.add(
      createViewportGizmoCubeAxes({
        axesSize: 2.1,
        rendererSize: size,
        xAxisColor: 'red',
        yAxisColor: 'green',
        // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js axis color
        zAxisColor: 'rgb(37, 78, 136)',
        xLabelColor: 'red',
        yLabelColor: 'green',
        // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js axis color
        zLabelColor: 'rgb(37, 78, 136)',
        lineWidth: 2,
        renderingBackend: graphicsBackendThree,
      }),
    );

    gizmo.attachControls(controls);

    invalidate();

    return () => {
      const existing = gizmoRef.current;
      gizmoRef.current = undefined;

      if (existing) {
        existing.removeEventListener('change', handleChange);
        existing.removeEventListener('hoverchange', handleChange);
        existing.dispose();
      }
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- dependencies array is user-provided for custom recreation triggers
  }, [
    camera,
    gl,
    controls,
    graphicsBackendThree,
    scene,
    serialized.hex,
    theme,
    size,
    handleChange,
    container,
    invalidate,
    ...dependencies,
  ]);

  useEffect(() => {
    if (gizmoRef.current) {
      syncGizmoFov(gizmoRef.current, cameraFovAngle);
    }
  }, [cameraFovAngle]);

  return null;
}
