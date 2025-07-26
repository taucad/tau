/* eslint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree } from '@react-three/fiber';
import type { GizmoAxisOptions, GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ReactNode } from 'react';
import { Theme, useTheme } from 'remix-themes';
import { useColor } from '~/hooks/use-color.js';
import { createViewportGizmoCubeAxes } from '~/components/geometry/graphics/three/viewport-gizmo-cube-axes.js';

type ViewportGizmoCubeProps = {
  readonly size?: number;
};

export function ViewportGizmoCube({ size = 128 }: ViewportGizmoCubeProps): ReactNode {
  const { camera, gl, controls, scene } = useThree((state) => ({
    camera: state.camera as THREE.PerspectiveCamera,
    gl: state.gl,
    controls: state.controls as OrbitControls,
    scene: state.scene,
  }));

  const gizmoRef = useRef<ViewportGizmo | undefined>(null);
  const canvasRef = useRef<HTMLCanvasElement | undefined>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | undefined>(null);
  const { serialized } = useColor();
  const [theme] = useTheme();

  // Define event handlers using useCallback to maintain references
  const handleStart = useCallback(() => {
    if (controls.update) {
      controls.update();
    }
  }, [controls]);

  const handleChange = useCallback(() => {
    if (controls.update) {
      controls.update();
    }

    if (gl && scene && camera) {
      gl.render(scene, camera);
    }
  }, [controls, gl, scene, camera]);

  const handleEnd = useCallback(() => {
    if (controls.update) {
      controls.update();
    }

    if (gl && scene && camera) {
      gl.render(scene, camera);
    }
  }, [controls, gl, scene, camera]);

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
    canvas.style.position = 'absolute';
    canvas.style.bottom = '0';
    canvas.style.right = '0';
    canvas.style.zIndex = '10';

    // Find the parent container to append our canvas
    const container = gl.domElement.parentElement;
    if (!container) {
      return;
    }

    // Append the canvas to the container
    container.append(canvas);
    canvasRef.current = canvas;

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
    rendererRef.current = renderer;

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
      resolution: 256,
      container,
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
    gizmoRef.current = gizmo;

    // Add event listeners for the gizmo
    gizmo.addEventListener('start', handleStart);
    gizmo.addEventListener('change', handleChange);
    gizmo.addEventListener('end', handleEnd);

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
      gizmo.removeEventListener('start', handleStart);
      gizmo.removeEventListener('change', handleChange);
      gizmo.removeEventListener('end', handleEnd);

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
  }, [camera, gl, controls, scene, serialized.hex, handleStart, handleChange, handleEnd, theme, size]);

  return null;
}
