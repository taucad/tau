/* eslint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree } from '@react-three/fiber';
import type { GizmoAxisOptions, GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ReactNode } from 'react';
import { Theme, useTheme } from 'remix-themes';
import { useColor } from '~/hooks/use-color.js';

const createAxesObject = ({
  axesSize = 2.1,
  xAxisColor = 'red',
  yAxisColor = 'green',
  zAxisColor = 'blue',
  xLabelColor = 'red',
  yLabelColor = 'green',
  zLabelColor = 'blue',
  lineOpacity = 0.6,
  lineWidth = 1.5,
}: {
  axesSize?: number;
  xAxisColor?: string;
  yAxisColor?: string;
  zAxisColor?: string;
  xLabelColor?: string;
  yLabelColor?: string;
  zLabelColor?: string;
  lineOpacity?: number;
  lineWidth?: number;
}) => {
  const axesLines = [
    {
      id: 'x',
      points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(axesSize, 0, 0)],
      lineColor: xAxisColor,
      labelColor: xLabelColor,
      label: 'X',
    },
    {
      id: 'y',
      points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axesSize, 0)],
      lineColor: yAxisColor,
      labelColor: yLabelColor,
      label: 'Y',
    },
    {
      id: 'z',
      points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axesSize)],
      lineColor: zAxisColor,
      labelColor: zLabelColor,
      label: 'Z',
    },
  ];

  const axes = new THREE.Group();
  for (const line of axesLines) {
    // Convert points to flat array for LineGeometry
    const positions = [];
    for (const point of line.points) {
      positions.push(point.x, point.y, point.z);
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = new LineMaterial({
      color: line.lineColor,
      linewidth: lineWidth,
      opacity: lineOpacity,
      resolution: new THREE.Vector2(axesSize, axesSize),
    });

    const lineObject = new Line2(geometry, material);
    axes.add(lineObject);

    // Add text label at the end of each axis
    const endPoint = line.points[1]!;

    // Create a canvas for the text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const textCanvasSize = 64;
    canvas.width = textCanvasSize;
    canvas.height = textCanvasSize;

    if (context) {
      // Set the entire canvas to transparent
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw the text with smaller font size
      context.fillStyle = line.labelColor;
      context.font = '100 48px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(line.label, textCanvasSize / 2, textCanvasSize / 2);
    }

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create a sprite with the texture
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      sizeAttenuation: false,
      depthTest: true,
      transparent: true,
    });

    // Set render order to ensure it renders on top
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 3;
    sprite.position.copy(endPoint);
    sprite.scale.set(0.08, 0.06, 1); // Reduced vertical scale from 0.1 to 0.06

    // Add increased offset to move labels further from line ends
    const direction = new THREE.Vector3().subVectors(endPoint, new THREE.Vector3(0, 0, 0)).normalize();
    sprite.position.add(direction.multiplyScalar(0.2));

    axes.add(sprite);
  }

  axes.position.set(-axesSize / 2, -axesSize / 2, -axesSize / 2);
  return axes;
};

type ViewportGizmoBlenderProps = {
  readonly size?: number;
};

export function ViewportGizmoBlender({ size = 128 }: ViewportGizmoBlenderProps): ReactNode {
  const { camera, gl, controls, scene } = useThree((state) => ({
    camera: state.camera,
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

    // Configure the gizmo options
    const gizmoConfig: GizmoOptions = {
      type: 'cube',
      placement: 'bottom-right',
      size,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      background: {
        color: backgroundColor,
        hover: { color: backgroundColor },
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

    // Create the gizmo
    const gizmo = new ViewportGizmo(camera, renderer, gizmoConfig);
    gizmoRef.current = gizmo;

    // Add event listeners for the gizmo
    gizmo.addEventListener('start', handleStart);
    gizmo.addEventListener('change', handleChange);
    gizmo.addEventListener('end', handleEnd);

    gizmo.scale.multiplyScalar(0.7);
    gizmo.add(
      createAxesObject({
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
