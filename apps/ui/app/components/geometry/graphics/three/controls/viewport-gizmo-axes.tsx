/* oxlint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree, useFrame } from '@react-three/fiber';
import type { GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons';
import type { ReactNode } from 'react';
import { useColor } from '#hooks/use-color.js';
import { useTheme } from '#hooks/use-theme.js';
import { resolveGizmoContainer, useGizmoResizeSync } from '#components/geometry/graphics/three/utils/gizmo.utils.js';

type ViewportGizmoAxesProps = {
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

const className = 'viewport-gizmo-axes';
const emptyDependencies: readonly unknown[] = [];

export function ViewportGizmoAxes({
  size = 96,
  container,
  dependencies = emptyDependencies,
}: ViewportGizmoAxesProps): ReactNode {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as OrbitControls;
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  const { serialized } = useColor();
  const { theme } = useTheme();

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref
  const gizmoRef = useRef<ViewportGizmo | undefined>(undefined);

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

    const gizmoConfig: GizmoOptions = {
      type: 'sphere',
      placement: 'bottom-right',
      size,
      resolution: 256,
      className,
      container: containerToUse,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      offset: {
        bottom: 0,
        right: 0,
      },
    };

    const gizmo = new ViewportGizmo(camera, gl, gizmoConfig);
    gizmoRef.current = gizmo;

    gizmo.addEventListener('change', handleChange);
    gizmo.addEventListener('hoverchange', handleChange);

    gizmo.scale.multiplyScalar(0.7);

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
  }, [camera, gl, controls, scene, serialized.hex, theme, size, handleChange, container, invalidate, ...dependencies]);

  return null;
}
