/* eslint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree } from '@react-three/fiber';
import type { GizmoAxisOptions, GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons';
import type { ReactNode } from 'react';
import { Theme, useTheme } from 'remix-themes';
import { useColor } from '#hooks/use-color.js';
import { createViewportGizmoCubeAxes } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.js';

type ViewportGizmoCubeProps = {
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
  size = 128,
  container,
  dependencies = emptyDependencies,
}: ViewportGizmoCubeProps): ReactNode {
  const { camera, gl, controls, scene, invalidate } = useThree((state) => ({
    camera: state.camera as THREE.PerspectiveCamera,
    gl: state.gl,
    controls: state.controls as OrbitControls,
    scene: state.scene,
    invalidate: state.invalidate,
  }));

  const { serialized } = useColor();
  const [theme] = useTheme();

  const handleChange = useCallback((): void => {
    invalidate();
  }, [invalidate]);

  // Create DOM overlay for gizmo
  useEffect(() => {
    // Early return if we don't have the required components
    if (!camera || !gl || !controls) {
      return;
    }

    function animation() {
      // Render the Gizmo
      renderer.toneMapping = THREE.NoToneMapping;
      gizmo.render();
    }

    // Create a separate canvas for the gizmo
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.style.position = 'absolute';
    canvas.style.bottom = '0';
    canvas.style.right = '0';
    canvas.style.zIndex = '10';

    // Find the parent container to append our canvas
    // Use the dedicated gizmo container if available (to support CSS anchor positioning),
    // otherwise fallback to the renderer's parent (legacy behavior).
    const containerToUse =
      typeof container === 'string'
        ? document.querySelector<HTMLElement>(container)
        : (container ?? gl.domElement.parentElement);
    if (!containerToUse) {
      return;
    }

    // Append the canvas to the container
    containerToUse.append(canvas);

    // Create a renderer for the gizmo
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(size, size);
    const dpr = Math.min(globalThis.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setAnimationLoop(animation);
    renderer.setClearColor(0x00_00_00, 0);

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

    // Configure the gizmo options
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

    // Create the gizmo
    const gizmo = new ViewportGizmo(camera, renderer, gizmoConfig);

    // Add event listeners for the gizmo
    gizmo.addEventListener('change', handleChange);

    gizmo.scale.multiplyScalar(0.7);
    gizmo.add(
      createViewportGizmoCubeAxes({
        axesSize: 2.1,
        xAxisColor: 'red',
        yAxisColor: 'green',
        zAxisColor: 'rgb(37, 78, 136)',
        xLabelColor: 'red',
        yLabelColor: 'green',
        zLabelColor: 'rgb(37, 78, 136)',
        lineWidth: 2,
      }),
    );

    // Attach the controls to enable proper interaction
    gizmo.attachControls(controls);

    // Cleanup function
    return () => {
      // Remove event listeners
      gizmo.removeEventListener('change', handleChange);

      // Dispose the gizmo
      gizmo.dispose();

      // Remove the canvas
      if (canvas.parentElement) {
        canvas.remove();
      }

      // Dispose the renderer
      if (renderer) {
        renderer.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies array is user-provided for custom recreation triggers
  }, [camera, gl, controls, scene, serialized.hex, theme, size, handleChange, container, ...dependencies]);

  return null;
}
