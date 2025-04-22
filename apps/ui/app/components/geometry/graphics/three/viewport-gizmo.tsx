import { useThree, useFrame } from '@react-three/fiber';
import type { GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ReactNode } from 'react';
import { useColor } from '@/hooks/use-color.js';

export function ViewportGizmoHelper(): ReactNode {
  const { camera, gl, controls, scene } = useThree((state) => ({
    camera: state.camera,
    gl: state.gl,
    controls: state.controls as OrbitControls,
    scene: state.scene,
  }));

  const gizmoRef = useRef<ViewportGizmo | undefined>(null);
  const canvasRef = useRef<HTMLCanvasElement | undefined>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | undefined>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { serialized } = useColor();

  // Define event handlers using useCallback to maintain references
  const handleStart = useCallback(() => {
    if (controls?.update) {
      controls.update();
    }
  }, [controls]);

  const handleChange = useCallback(() => {
    if (controls?.update) {
      controls.update();
    }

    if (gl && scene && camera) {
      gl.render(scene, camera);
    }
  }, [controls, gl, scene, camera]);

  const handleEnd = useCallback(() => {
    if (controls?.update) {
      controls.update();
    }

    if (gl && scene && camera) {
      gl.render(scene, camera);
    }
  }, [controls, gl, scene, camera]);

  // Create DOM overlay for gizmo
  useEffect(() => {
    // Early return if we don't have the required components
    if (!camera || !gl || !controls) return;

    function animation() {
      // Render the Gizmo
      renderer.toneMapping = THREE.NoToneMapping;
      gizmo.render();
    }

    // Create a separate canvas for the gizmo
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.bottom = '10px';
    canvas.style.right = '10px';
    canvas.style.zIndex = '10';

    // Find the parent container to append our canvas
    const container = gl.domElement.parentElement;
    if (!container) return;

    // Append the canvas to the container
    container.append(canvas);
    canvasRef.current = canvas;

    // Create a renderer for the gizmo
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(128, 128);
    const dpr = Math.min(globalThis.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setAnimationLoop(animation);
    renderer.setClearColor(0x00_00_00, 0);
    rendererRef.current = renderer;

    // Configure the gizmo options
    const gizmoConfig: GizmoOptions = {
      type: 'cube',
      placement: 'bottom-right',
      resolution: 2048,
      font: {
        weight: 'normal',
      },
      background: {
        color: 0x44_44_44,
        hover: { color: 0x44_44_44 },
      },
      corners: {
        color: 0x33_33_33,
        hover: {
          color: serialized.hex,
        },
      },
      edges: {
        color: 0x33_33_33,
        opacity: 1,
        hover: {
          color: serialized.hex,
        },
      },
      right: {
        color: 0x33_33_33,
        labelColor: 0xdd_dd_dd,
        hover: {
          color: serialized.hex,
        },
      },
      top: {
        color: 0x33_33_33,
        labelColor: 0xdd_dd_dd,
        hover: {
          color: serialized.hex,
        },
      },
      front: {
        color: 0x33_33_33,
        labelColor: 0xdd_dd_dd,
        hover: {
          color: serialized.hex,
        },
      },
      back: {
        color: 0x33_33_33,
        labelColor: 0xdd_dd_dd,
        hover: {
          color: serialized.hex,
        },
      },
      left: {
        color: 0x33_33_33,
        labelColor: 0xdd_dd_dd,
        hover: {
          color: serialized.hex,
        },
      },
      bottom: {
        color: 0x33_33_33,
        labelColor: 0xdd_dd_dd,
        hover: {
          color: serialized.hex,
        },
      },
    };

    // Create the gizmo
    const gizmo = new ViewportGizmo(camera, renderer, gizmoConfig);
    gizmoRef.current = gizmo;

    // Add event listeners for the gizmo
    gizmo.addEventListener('start', handleStart);
    gizmo.addEventListener('change', handleChange);
    gizmo.addEventListener('end', handleEnd);

    // Attach the controls to enable proper interaction
    gizmo.attachControls(controls);

    // Mark initialization as complete
    setIsInitialized(true);

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
  }, [camera, gl, controls, scene, serialized.hex, handleStart, handleChange, handleEnd]);

  // Render the gizmo in each frame
  useFrame(() => {
    if (isInitialized && gizmoRef.current) {
      gizmoRef.current.render();
    }
  });

  return null;
}
