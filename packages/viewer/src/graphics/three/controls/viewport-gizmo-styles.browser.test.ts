import '#test/browser.css';
import { afterEach, describe, expect, it } from 'vitest';
import { Color, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { ViewportGizmo } from 'three-viewport-gizmo';
import type { GizmoTarget } from 'three-viewport-gizmo';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import { resolveViewportGizmoStyleConfig } from '#graphics/three/controls/viewport-gizmo-styles.js';
import { viewportGizmoClassName } from '#graphics/three/controls/viewport-gizmo-adapter.js';
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
  delete document.documentElement.dataset['pointerCursors'];
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
    up: { x: 0, y: 0, z: 1 },
    size: 300,
    container: document.body,
    placement: 'top-left',
    offset: { top: 0, left: 0 },
    animated: false,
    className: viewportGizmoClassName,
    ...config.options,
  });
  gizmo.enabled = config.clickable;
  gizmo.update();
  cleanups.push(() => {
    gizmo.dispose();
    renderer.dispose();
    canvas.remove();
  });
  return { gizmo, camera };
};

/** The targets the style draws: hidden ones stay in `gizmo.targets` with their option `enabled: false`. */
const targetsOf = (gizmo: ViewportGizmo): readonly GizmoTarget[] =>
  gizmo.targets.filter((target) => gizmo.options.type !== 'sphere' || target.kind === 'face');

// ponytail: the 2.x test clicked each target through private fields; 3.0 has no public target-to-screen projection,
// so this turns through `lookFrom` by name. A real pointer click per target belongs to the library's own browser tests.
const turnTo = async (gizmo: ViewportGizmo, target: GizmoTarget): Promise<string> => {
  const end = await gizmo.lookFrom(target.name);
  return end.outcome.status;
};

describe('gizmo styles in the browser', () => {
  it.each([
    { gizmoStyle: 'cube', kinds: ['face', 'edge', 'corner'] },
    { gizmoStyle: 'classic-cube', kinds: ['face', 'edge', 'corner'] },
    { gizmoStyle: 'axis-balls', kinds: [] },
  ] as const)('$gizmoStyle: each target turns to its view (G1 to G3)', async ({ gizmoStyle, kinds }) => {
    const { gizmo } = mountGizmo(gizmoStyle);
    const targets = targetsOf(gizmo);
    expect(targets.length).toBe(gizmoStyle === 'axis-balls' ? 6 : 26);
    if (kinds.length > 0) {
      expect(new Set(targets.map((target) => target.kind))).toEqual(new Set(kinds));
    }
    for (const target of targets) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each turn starts where the last one ended.
      expect(await turnTo(gizmo, target), target.name).toBe('reached');
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
    // Display-only: the cube's `[data-disabled]` rule lets a press through to the canvas.
    expect(gizmo.enabled).toBe(false);
    expect(Object.hasOwn(gizmo.domElement.dataset, 'disabled')).toBe(true);
    expect(getComputedStyle(gizmo.domElement).pointerEvents).toBe('none');
    expect(gizmo.options.corners.enabled).toBe(false);
    expect(gizmo.options.edges.enabled).toBe(false);
    expect(camera.quaternion.equals(before)).toBe(true);
    expect(gizmo.animating).toBe(false);
  });

  it('takes the action cursor over a target, the grabbing cursor while dragging, and no input when disabled (TA2)', () => {
    // Pointer cursors on, so the action cursor token resolves to `pointer` rather than the default arrow.
    document.documentElement.dataset['pointerCursors'] = 'true';
    const { gizmo } = mountGizmo('cube');
    const element = gizmo.domElement;
    const cursor = (): string => getComputedStyle(element).cursor;
    const { left, top, width, height } = element.getBoundingClientRect();
    const centre = { clientX: left + width / 2, clientY: top + height / 2 };
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };

    expect(cursor()).toBe('auto');

    element.dispatchEvent(new PointerEvent('pointermove', { ...pointer, ...centre }));
    expect(gizmo.hovered).not.toBeNull();
    expect(cursor()).toBe('pointer');

    element.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, ...centre, button: 0, buttons: 1 }));
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        ...pointer,
        clientX: centre.clientX + 40,
        clientY: centre.clientY,
        buttons: 1,
      }),
    );
    expect(gizmo.dragging).toBe(true);
    expect(cursor()).toBe('grabbing');
    element.dispatchEvent(
      new PointerEvent('pointerup', { ...pointer, clientX: centre.clientX + 40, clientY: centre.clientY, button: 0 }),
    );
    expect(gizmo.dragging).toBe(false);

    gizmo.enabled = false;
    expect(getComputedStyle(element).pointerEvents).toBe('none');
  });
});
