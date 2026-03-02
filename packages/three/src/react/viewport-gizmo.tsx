/* eslint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree, useFrame } from '@react-three/fiber';
import type { GizmoAxisOptions, GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons';
import type { ReactNode } from 'react';
import { createViewportGizmoCubeAxes } from '#controls/viewport-gizmo-cube-axes.js';
import { useViewerStore } from '#react/stores/store-context.js';
import {
  syncGizmoFov,
  resolveGizmoContainer,
  createGizmoCanvas,
  createGizmoRenderer,
  disposeGizmoResources,
} from '#utils/gizmo.utils.js';

type ViewportGizmoProperties = {
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
   * Useful for triggering recreation when coordinate systems or other external state changes.
   *
   * @example
   * ```tsx
   * <ViewportGizmoCube dependencies={[enableYupRotation]} />
   * ```
   */
  readonly dependencies?: readonly unknown[];
};

const className = 'viewport-gizmo-cube';
const emptyDependencies: readonly unknown[] = [];

export function ViewportGizmoCube({
  size = 96,
  container,
  dependencies = emptyDependencies,
}: ViewportGizmoProperties): ReactNode {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as OrbitControls;
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  const accentColor = useViewerStore((state) => state.accentColor);
  const theme = useViewerStore((state) => state.theme);
  const fieldOfView = useViewerStore((state) => state.fieldOfView);

  const fieldOfViewRef = useRef(fieldOfView);
  fieldOfViewRef.current = fieldOfView;

  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref
  const gizmoRef = useRef<ViewportGizmo | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const handleChange = useCallback((): void => {
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    if (!camera || !gl || !controls) {
      return;
    }

    const canvas = createGizmoCanvas(className);

    const containerToUse = resolveGizmoContainer(container, gl.domElement);
    if (!containerToUse) {
      return;
    }

    containerToUse.append(canvas);

    const renderer = createGizmoRenderer(canvas, size);

    const faceConfig = {
      color: theme === 'dark' ? 0x33_33_33 : 0xdd_dd_dd,
      labelColor: theme === 'dark' ? 0xff_ff_ff : 0x00_00_00,
      hover: {
        color: accentColor,
      },
    } as const satisfies GizmoAxisOptions;
    const edgeConfig = {
      color: theme === 'dark' ? 0x55_55_55 : 0xee_ee_ee,
      opacity: 1,
      hover: {
        color: accentColor,
      },
    } as const satisfies GizmoAxisOptions;
    const cornerConfig = {
      ...faceConfig,
      color: theme === 'dark' ? 0x33_33_33 : 0xdd_dd_dd,
      hover: {
        color: accentColor,
      },
    } as const satisfies GizmoAxisOptions;

    const gizmoConfig: GizmoOptions = {
      type: 'rounded-cube',
      placement: 'bottom-right',
      size,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      radius: 0.3,
      offset: {
        bottom: 0,
        right: 0,
      },
      className,
      resolution: 256,
      container: containerToUse,
      corners: cornerConfig,
      edges: edgeConfig,
      right: faceConfig,
      top: faceConfig,
      front: faceConfig,
      back: faceConfig,
      left: faceConfig,
      bottom: faceConfig,
    };

    const gizmo = new ViewportGizmo(camera, renderer, gizmoConfig);
    gizmoRef.current = gizmo;
    rendererRef.current = renderer;

    syncGizmoFov(gizmo, fieldOfViewRef.current);

    gizmo.addEventListener('change', handleChange);

    gizmo.scale.multiplyScalar(0.7);
    gizmo.add(
      createViewportGizmoCubeAxes({
        axesSize: 2.1,
        rendererSize: size,
        xAxisColor: 'red',
        yAxisColor: 'green',
        zAxisColor: 'rgb(37, 78, 136)',
        xLabelColor: 'red',
        yLabelColor: 'green',
        zLabelColor: 'rgb(37, 78, 136)',
        lineWidth: 2,
      }),
    );

    gizmo.attachControls(controls);

    return () => {
      gizmoRef.current = null;
      rendererRef.current = null;

      disposeGizmoResources({ gizmo, renderer, canvas, handleChange });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies array is user-provided for custom recreation triggers
  }, [camera, gl, controls, scene, accentColor, theme, size, handleChange, container, ...dependencies]);

  useFrame(() => {
    if (rendererRef.current && gizmoRef.current) {
      rendererRef.current.toneMapping = THREE.NoToneMapping;
      gizmoRef.current.render();
    }
  });

  useEffect(() => {
    if (gizmoRef.current) {
      syncGizmoFov(gizmoRef.current, fieldOfView);
    }
  }, [fieldOfView]);

  return null;
}
