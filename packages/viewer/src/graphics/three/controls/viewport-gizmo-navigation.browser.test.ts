import '#test/browser.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { ViewportGizmo } from 'three-viewport-gizmo';
import type { GizmoTurnEnd, ViewportGizmoEventMap } from 'three-viewport-gizmo';
import { viewportGizmoOptions } from '#graphics/three/controls/viewport-gizmo-adapter.js';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import { resolveViewportGizmoStyleConfig } from '#graphics/three/controls/viewport-gizmo-styles.js';
import type { OrbitStyle } from '#graphics/three/controls/camera-wheel-router.js';

/*
 * TA6 in a real browser: Tau's view cube options per orbit style, on a real `ViewportGizmo` in controlled mode. The
 * host applies each reported pose to its camera, as the camera actor does, so the cube's built-in navigation buttons
 * are tested as Tau runs them: side triangles in both orbit styles, roll arrows and roll keys in Free orbit only.
 */

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const worldUp = new Vector3(0, 0, 1);

type Cube = Readonly<{ gizmo: ViewportGizmo; camera: PerspectiveCamera; button: (name: string) => HTMLButtonElement }>;

const mountCube = async (orbitStyle: OrbitStyle): Promise<Cube> => {
  await page.viewport(600, 400);
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px';
  document.body.append(stage);
  const canvas = document.createElement('canvas');
  stage.append(canvas);
  const renderer = new WebGLRenderer({ canvas });
  renderer.setSize(600, 400);
  const camera = new PerspectiveCamera(45, 1.5, 0.1, 100);
  camera.up.copy(worldUp);
  camera.position.set(0, -8, 0);
  camera.lookAt(new Vector3());
  const style = readViewportGizmoStyle({
    container: stage,
    colorScheme: 'light',
    isHighContrast: false,
    accentColor: '#008c7d',
  });
  const gizmo = new ViewportGizmo(camera, renderer, {
    ...viewportGizmoOptions({
      style,
      upDirection: 'z',
      orbitStyle,
      container: stage,
      placeTopRight: true,
      size: 96,
      styleConfig: resolveViewportGizmoStyleConfig({
        gizmoStyle: 'cube',
        colors: style,
        radius: viewportGizmoMetrics.radius,
      }),
    }),
    animated: false,
  });
  // The host's duty in controlled mode: apply each reported pose to its camera, as the camera actor does in Tau.
  const apply = ({ pose }: ViewportGizmoEventMap['change']): void => {
    const distance = camera.position.distanceTo(gizmo.target);
    camera.position.copy(gizmo.target).addScaledVector(pose.direction, distance);
    camera.up.copy(pose.up);
    camera.lookAt(gizmo.target);
    gizmo.update();
  };
  gizmo.addEventListener('change', apply);
  gizmo.update();
  gizmo.render();
  cleanups.push(() => {
    gizmo.removeEventListener('change', apply);
    gizmo.dispose();
    renderer.dispose();
    stage.remove();
  });
  const button = (name: string): HTMLButtonElement =>
    gizmo.domElement.querySelector<HTMLButtonElement>(`[data-navigation="${name}"]`)!;
  return { gizmo, camera, button };
};

const shown = (cube: Cube): string[] =>
  [...cube.gizmo.domElement.querySelectorAll<HTMLButtonElement>('[data-navigation]')]
    .filter((button) => !button.hidden)
    .map((button) => button.dataset['navigation']!);

/** Clicks a navigation button and waits for its turn to end. */
const press = async (cube: Cube, name: string): Promise<GizmoTurnEnd> => {
  const ended = new Promise<GizmoTurnEnd>((resolve) => {
    const onEnd = (event: unknown): void => {
      cube.gizmo.removeEventListener('end', onEnd);
      resolve(event as GizmoTurnEnd);
    };
    cube.gizmo.addEventListener('end', onEnd);
  });
  cube.button(name).click();
  return ended;
};

/** Whether the camera is upright: its up leans toward the world up, in the plane of the world up and the view. */
const isUpright = (camera: PerspectiveCamera): boolean => {
  const direction = camera.position.clone().normalize();
  const side = new Vector3().crossVectors(worldUp, direction);
  return side.lengthSq() < 1e-9 || (Math.abs(camera.up.dot(side.normalize())) < 1e-6 && camera.up.dot(worldUp) > 0);
};

describe.each(['turntable', 'free'] as const)('view cube navigation in %s', (orbitStyle) => {
  it('reveals the side triangles and Home on focus, and the roll arrows in Free orbit only', async () => {
    const cube = await mountCube(orbitStyle);
    expect(shown(cube)).toEqual([]);
    cube.gizmo.domElement.focus();
    await vi.waitFor(() => {
      expect(shown(cube)).toEqual(
        orbitStyle === 'free'
          ? ['roll-clockwise', 'up', 'roll-counterclockwise', 'left', 'right', 'down', 'home']
          : ['up', 'left', 'right', 'down', 'home'],
      );
    });
    expect(cube.gizmo.canRoll).toBe(orbitStyle === 'free');
  });

  it.each(['up', 'right', 'down', 'left'] as const)(
    'turns to the face its %s triangle names, and keeps the view upright in Turntable',
    async (side) => {
      const cube = await mountCube(orbitStyle);
      cube.gizmo.domElement.focus();
      const name = cube.button(side).getAttribute('aria-label')!;
      expect(name).toMatch(/^Turn to (Top|Bottom|Left|Right|Back)$/u);
      const end = await press(cube, side);
      expect(end.outcome.status).toBe('reached');
      expect(`Turn to ${cube.gizmo.atTarget?.target.label}`).toBe(name);
      expect(cube.camera.position.clone().normalize().angleTo(cube.gizmo.atTarget!.target.direction)).toBeLessThan(
        2e-3,
      );
      if (orbitStyle === 'turntable') {
        expect(isUpright(cube.camera)).toBe(true);
      }
    },
  );

  it('hides the triangles after a free drag and shows them again after a cube click', async () => {
    const cube = await mountCube(orbitStyle);
    cube.gizmo.domElement.focus();
    await vi.waitFor(() => {
      expect(shown(cube)).toContain('up');
    });
    const away = document.createElement('div');
    away.style.cssText = 'position:fixed;left:380px;top:120px;width:4px;height:4px';
    document.body.append(away);
    cleanups.push(() => {
      away.remove();
    });
    await userEvent.dragAndDrop(cube.gizmo.domElement, away);
    expect(cube.gizmo.atTarget).toBeNull();
    expect(shown(cube)).not.toContain('up');
    // The face under the cube's centre after the drag.
    await userEvent.click(cube.gizmo.domElement);
    await vi.waitFor(() => {
      expect(cube.gizmo.atTarget?.target.kind).toBe('face');
    });
    cube.gizmo.domElement.focus();
    await vi.waitFor(() => {
      expect(shown(cube)).toContain('up');
    });
  });

  it('returns upright with Home', async () => {
    const cube = await mountCube(orbitStyle);
    if (orbitStyle === 'free') {
      await press(cube, 'roll-clockwise');
      expect(isUpright(cube.camera)).toBe(false);
    }
    const end = await press(cube, 'home');
    expect(end.outcome.status).toBe('reached');
    expect(cube.gizmo.atTarget?.target.name).toBe('top-front-right');
    expect(isUpright(cube.camera)).toBe(true);
  });

  it('returns upright on a double-click on the cube', async () => {
    const cube = await mountCube(orbitStyle);
    if (orbitStyle === 'free') {
      await press(cube, 'roll-clockwise');
      expect(isUpright(cube.camera)).toBe(false);
    }
    await userEvent.dblClick(cube.gizmo.domElement);
    await vi.waitFor(() => {
      expect(cube.gizmo.animating).toBe(false);
      expect(isUpright(cube.camera)).toBe(true);
    });
  });

  it(orbitStyle === 'free' ? 'rolls a quarter turn with the roll key' : 'takes no roll key', async () => {
    const cube = await mountCube(orbitStyle);
    cube.gizmo.domElement.focus();
    const up = cube.camera.up.clone();
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await vi.waitFor(() => {
      expect(cube.camera.up.angleTo(up)).toBeCloseTo(orbitStyle === 'free' ? Math.PI / 2 : 0, 3);
    });
  });

  it('names every button, keeps row order for focus and gives each a 24 px target', async () => {
    const cube = await mountCube(orbitStyle);
    cube.gizmo.domElement.focus();
    const buttons = [...cube.gizmo.domElement.querySelectorAll<HTMLButtonElement>('[data-navigation]')];
    expect(buttons.map((button) => button.dataset['navigation'])).toEqual([
      'roll-clockwise',
      'up',
      'roll-counterclockwise',
      'left',
      'right',
      'down',
      'home',
    ]);
    await vi.waitFor(() => {
      expect(shown(cube).length).toBeGreaterThan(0);
    });
    for (const button of buttons.filter((each) => !each.hidden)) {
      expect(button.getAttribute('aria-label')).not.toBe('');
      expect(button.tabIndex).toBe(0);
      const { width, height } = button.getBoundingClientRect();
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(24);
    }
    expect(cube.gizmo.domElement.getAttribute('role')).toBe('application');
  });
});
