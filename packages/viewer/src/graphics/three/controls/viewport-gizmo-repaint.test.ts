/*
 * The view cube's in-place repaint and its pole views against the real `ViewportGizmo`: `set` restyles the same cube,
 * and in controlled mode the pose the cube reports is the one the camera presents.
 */
import * as THREE from 'three';
import { ViewportGizmo } from 'three-viewport-gizmo';
import type { ViewportGizmoEventMap } from 'three-viewport-gizmo';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readViewportGizmoPose, viewportGizmoOptions } from '#graphics/three/controls/viewport-gizmo-adapter.js';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import { gizmoStyleIds, resolveViewportGizmoStyleConfig } from '#graphics/three/controls/viewport-gizmo-styles.js';

/** The renderer surface the cube reads while it builds: its canvas, viewport and scissor. */
const renderer = {
  domElement: document.createElement('canvas'),
  getViewport: (target: THREE.Vector4) => target.set(0, 0, 800, 600),
  getScissor: (target: THREE.Vector4) => target.set(0, 0, 800, 600),
  getScissorTest: () => false,
} as unknown as THREE.WebGLRenderer;

/** The jsdom environment has no 2D canvas: a context whose every method does nothing, enough for the cube to paint its labels. */
const noopContext = new Proxy(
  {},
  {
    get: (_target, key) => (key === 'measureText' ? () => ({ width: 1 }) : () => undefined),
    set: () => true,
  },
);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopContext as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('view cube repaint', () => {
  it('should keep the same element and children across repeated repaints', () => {
    const gizmo = new ViewportGizmo(new THREE.PerspectiveCamera(), renderer, {
      type: 'cube',
      container: document.body,
      triad: { enabled: true },
    });
    const { domElement } = gizmo;
    const painted = gizmo.root.children.length;

    for (let repaint = 0; repaint < 3; repaint += 1) {
      gizmo.set({ x: { color: repaint }, triad: { enabled: true } });
    }

    expect(gizmo.domElement).toBe(domElement);
    expect(gizmo.root.children).toHaveLength(painted);
    gizmo.dispose();
  });
});

describe('view cube options', () => {
  it.each(gizmoStyleIds)('should build and restyle the %s style with the options Tau passes', (gizmoStyle) => {
    const style = readViewportGizmoStyle({
      container: document.body,
      colorScheme: 'light',
      isHighContrast: false,
      accentColor: '#008c7d',
    });
    const options = (upDirection: 'x' | 'y' | 'z') =>
      viewportGizmoOptions({
        style,
        upDirection,
        container: document.body,
        placeTopRight: false,
        size: 96,
        styleConfig: resolveViewportGizmoStyleConfig({
          gizmoStyle,
          colors: style,
          radius: viewportGizmoMetrics.radius,
        }),
      });
    const gizmo = new ViewportGizmo(new THREE.PerspectiveCamera(), renderer, options('z'));

    // The library throws on an unknown or invalid key, so building and restyling is the check.
    gizmo.set(options('y'));

    expect(gizmo.options.controlled).toBe(true);
    expect(gizmo.options.up.toArray()).toEqual([0, 1, 0]);
    gizmo.dispose();
  });
});

describe('view cube pole views', () => {
  const axes = ['x', 'y', 'z'] as const;
  const cases = axes.flatMap((up) => [1, -1].map((sign) => ({ up, sign })));

  it.each(cases)('should present the view the cube reported, $up up, side $sign', async ({ up, sign }) => {
    const camera = new THREE.PerspectiveCamera();
    camera.up.set(0, 0, 0)[up] = 1;
    camera.position.set(3, 4, 5);
    camera.lookAt(0, 0, 0);
    const gizmo = new ViewportGizmo(camera, renderer, {
      type: 'cube',
      up: camera.up,
      container: document.body,
      controlled: true,
      roll: false,
    });
    const pole = new THREE.Vector3();
    pole[up] = sign;

    const end: ViewportGizmoEventMap['end'] = await gizmo.lookFrom(pole, { animated: false });
    const pose = readViewportGizmoPose({
      pose: end.pose,
      target: gizmo.target,
      renderFrame: { anchorFrameId: 'test-root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
      verticalSpan: 1,
    });

    // The camera presents an upright view from the pose's direction; it has to be the one the cube reported.
    const presented = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(new THREE.Vector3(...pose.direction), new THREE.Vector3(), end.pose.up),
    );
    const reported = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(end.pose.direction, new THREE.Vector3(), end.pose.up),
    );
    expect(presented.angleTo(reported)).toBeLessThan(0.01);
    gizmo.dispose();
  });
});
