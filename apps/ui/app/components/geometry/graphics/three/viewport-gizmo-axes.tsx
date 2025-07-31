/* eslint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree } from '@react-three/fiber';
import type { GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ReactNode } from 'react';
import { useTheme } from 'remix-themes';
import { useColor } from '#hooks/use-color.js';

type ViewportGizmoAxesProps = {
  readonly size?: number;
};

export function ViewportGizmoAxes({ size = 128 }: ViewportGizmoAxesProps): ReactNode {
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

    // Configure the gizmo options
    const gizmoConfig: GizmoOptions = {
      type: 'sphere',
      placement: 'bottom-right',
      size,
      resolution: 256,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      offset: {
        bottom: 0,
        right: 0,
      },
      container,
    };

    // Create the gizmo
    const gizmo = new ViewportGizmo(camera, renderer, gizmoConfig);

    // Add event listeners for the gizmo
    gizmo.addEventListener('change', handleChange);

    gizmo.scale.multiplyScalar(0.7);

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
  }, [camera, gl, controls, scene, serialized.hex, theme, size, handleChange]);

  return null;
}
