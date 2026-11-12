import '#test/browser.css';
import { afterEach, describe, expect, it } from 'vitest';
import { Color, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import type { Camera, Object3D } from 'three';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { applyViewportGizmoSurface } from '#graphics/three/controls/viewport-gizmo-cube-surface.js';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import {
  hideViewportGizmoTargets,
  resolveViewportGizmoStyleConfig,
} from '#graphics/three/controls/viewport-gizmo-styles.js';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';

/*
 * G1 to G3 and G5 in a real browser: each style's library gizmo, built from Tau's tokens, takes a click on each of its
 * targets and starts the snap to that view; its colours follow the theme.
 */

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  document.documentElement.classList.remove('dark');
});

const mountGizmo = (gizmoStyle: GizmoStyleId): Readonly<{ gizmo: ViewportGizmo; camera: PerspectiveCamera }> => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const renderer = new WebGLRenderer({ canvas });
  renderer.setSize(400, 400);
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(6, -6, 4);
  camera.lookAt(new Vector3());
  const style = readViewportGizmoStyle({
    container: document.body,
    colorScheme: 'light',
    isHighContrast: false,
    accentColor: '#008c7d',
  });
  const config = resolveViewportGizmoStyleConfig({ gizmoStyle, colors: style, radius: viewportGizmoMetrics.radius });
  const gizmo = new ViewportGizmo(camera, renderer, {
    up: 'z',
    size: 300,
    container: document.body,
    placement: 'top-left',
    offset: { top: 0, left: 0 },
    background: { enabled: false },
    animated: false,
    ...config.options,
  });
  if (config.surface === 'tau') {
    applyViewportGizmoSurface(gizmo, style, 'webgl');
  }
  if (!config.clickable) {
    hideViewportGizmoTargets(gizmo);
  }
  gizmo.scale.multiplyScalar(config.scale);
  gizmo.update();
  cleanups.push(() => {
    gizmo.dispose();
    renderer.dispose();
    canvas.remove();
  });
  return { gizmo, camera };
};

/** The client position of a target's centre on the gizmo's surface. */
const screenPositionOf = (gizmo: ViewportGizmo, target: Object3D): Readonly<{ x: number; y: number }> => {
  const gizmoCamera = Reflect.get(gizmo, '_camera') as Camera;
  const surface = Reflect.get(gizmo, '_domElement') as HTMLElement;
  gizmo.updateMatrixWorld(true);
  gizmoCamera.updateMatrixWorld(true);
  const point = target.getWorldPosition(new Vector3()).project(gizmoCamera);
  const rect = surface.getBoundingClientRect();
  return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
};

/** The targets a click can pick: the cube's faces, edges and corners, or the six balls. */
const targetsOf = (gizmo: ViewportGizmo): readonly Object3D[] =>
  (Reflect.get(gizmo, '_intersections') as Object3D[]).filter((target) => target.visible);

/** Whether a target faces the camera that views the gizmo, so a click at its centre lands on it. */
const facesViewer = (gizmo: ViewportGizmo, target: Object3D, threshold: number): boolean => {
  const gizmoCamera = Reflect.get(gizmo, '_camera') as Camera;
  const toCamera = gizmoCamera.position.clone().sub(target.getWorldPosition(new Vector3()));
  return target.getWorldPosition(new Vector3()).normalize().dot(toCamera.normalize()) > threshold;
};

const click = (gizmo: ViewportGizmo, target: Object3D): Readonly<{ changed: boolean; animating: boolean }> => {
  const surface = Reflect.get(gizmo, '_domElement') as HTMLElement;
  const { x, y } = screenPositionOf(gizmo, target);
  let changed = false;
  const onChange = (): void => {
    changed = true;
  };
  gizmo.addEventListener('change', onChange);
  gizmo.domUpdate();
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' };
  surface.dispatchEvent(new PointerEvent('pointerdown', init));
  document.dispatchEvent(new PointerEvent('pointerup', init));
  gizmo.removeEventListener('change', onChange);
  const { animating } = gizmo;
  gizmo.animating = false;
  return { changed, animating };
};

describe('gizmo styles in the browser', () => {
  it.each([
    { gizmoStyle: 'cube', kinds: ['face', 'edge', 'corner'] },
    { gizmoStyle: 'classic-cube', kinds: ['face', 'edge', 'corner'] },
    { gizmoStyle: 'axis-balls', kinds: [] },
  ] as const)('$gizmoStyle: a click on each target in view snaps to that view (G1 to G3)', ({ gizmoStyle, kinds }) => {
    const { gizmo } = mountGizmo(gizmoStyle);
    // A ball is round, so every ball on the near side is in view; a cube target must face the viewer.
    const threshold = gizmoStyle === 'axis-balls' ? 0 : 0.35;
    const targets = targetsOf(gizmo).filter((target) => facesViewer(gizmo, target, threshold));
    expect(targets.length).toBeGreaterThan(gizmoStyle === 'axis-balls' ? 2 : 6);
    if (kinds.length > 0) {
      expect(new Set(targets.map((target) => target.userData['kind'] as string))).toEqual(new Set(kinds));
    }
    for (const target of targets) {
      expect(
        click(gizmo, target),
        `${target.userData['kind'] as string} at ${target.position.toArray().join(',')}`,
      ).toEqual({ changed: true, animating: true });
    }
  });

  it('axis balls: one ball per axis direction, in the axis hues', () => {
    const { gizmo } = mountGizmo('axis-balls');
    expect(targetsOf(gizmo)).toHaveLength(6);
    const style = readViewportGizmoStyle({
      container: document.body,
      colorScheme: 'light',
      isHighContrast: false,
      accentColor: '#008c7d',
    });
    const config = resolveViewportGizmoStyleConfig({
      gizmoStyle: 'axis-balls',
      colors: style,
      radius: viewportGizmoMetrics.radius,
    });
    const channels = (value: unknown): Color => new Color(value as string);
    expect(channels(config.options.x?.color).r).toBeGreaterThan(channels(config.options.x?.color).b);
    expect(channels(config.options.y?.color).g).toBeGreaterThan(channels(config.options.y?.color).r);
    expect(channels(config.options.z?.color).b).toBeGreaterThan(channels(config.options.z?.color).r);
  });

  it.each(['cube', 'classic-cube', 'axis-balls', 'axes'] as const)(
    '%s takes its colours from the theme (G5)',
    (gizmoStyle) => {
      const read = (colorScheme: 'light' | 'dark') => {
        document.documentElement.classList.toggle('dark', colorScheme === 'dark');
        const style = readViewportGizmoStyle({
          container: document.body,
          colorScheme,
          isHighContrast: false,
          accentColor: '#008c7d',
        });
        return resolveViewportGizmoStyleConfig({ gizmoStyle, colors: style, radius: viewportGizmoMetrics.radius });
      };
      const light = read('light');
      const dark = read('dark');
      expect(dark.options).not.toEqual(light.options);
    },
  );

  it('axes: shows no target and takes no click, so a press reaches the canvas below (G4)', () => {
    const { gizmo, camera } = mountGizmo('axes');
    const before = camera.quaternion.clone();
    const surface = Reflect.get(gizmo, '_domElement') as HTMLElement;
    const all = Reflect.get(gizmo, '_intersections') as Object3D[];
    expect(targetsOf(gizmo)).toHaveLength(0);
    for (const target of all) {
      const { x, y } = screenPositionOf(gizmo, target);
      expect(document.elementFromPoint(x, y)).not.toBe(surface);
    }
    expect(camera.quaternion.equals(before)).toBe(true);
    expect(gizmo.animating).toBe(false);
  });
});
