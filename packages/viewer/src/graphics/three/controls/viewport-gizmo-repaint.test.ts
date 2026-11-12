/*
 * The view cube's in-place repaint against the real `ViewportGizmo`: `set` regenerates the cube, and the adapter's
 * `disposeViewportGizmoChildren` first takes every old child away, so no stale face, label or axis stays drawn.
 */
import * as THREE from 'three';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeViewportGizmoChildren } from '#graphics/three/controls/viewport-gizmo-adapter.js';

/** The renderer surface the cube reads while it builds: its canvas, viewport and scissor. */
const renderer = {
  domElement: document.createElement('canvas'),
  getViewport: (target: THREE.Vector4) => target.set(0, 0, 800, 600),
  getScissor: (target: THREE.Vector4) => target.set(0, 0, 800, 600),
  getScissorTest: () => false,
} as unknown as THREE.WebGLRenderer;

const createGizmo = (): ViewportGizmo =>
  new ViewportGizmo(new THREE.PerspectiveCamera(), renderer, { type: 'cube', container: document.body });

/** An axes group standing in for the cube's axes: a line and a textured label. */
const createAxes = (): { axes: THREE.Group; label: THREE.SpriteMaterial; line: THREE.BufferGeometry } => {
  const axes = new THREE.Group();
  const line = new THREE.BufferGeometry();
  const label = new THREE.SpriteMaterial({ map: new THREE.Texture() });
  axes.add(new THREE.Line(line, new THREE.LineBasicMaterial()), new THREE.Sprite(label));
  return { axes, label, line };
};

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
  it('should keep the same children across repeated repaints', () => {
    const gizmo = createGizmo();
    gizmo.add(createAxes().axes);
    const painted = gizmo.children.length;

    for (let repaint = 0; repaint < 3; repaint += 1) {
      disposeViewportGizmoChildren(gizmo);
      gizmo.set({ type: 'cube', container: document.body });
      gizmo.add(createAxes().axes);
    }

    expect(gizmo.children).toHaveLength(painted);
    gizmo.dispose();
  });

  it('should dispose every face material and the axes with their label textures', () => {
    const gizmo = createGizmo();
    const { axes, label, line } = createAxes();
    gizmo.add(axes);
    const faces = gizmo.children.flatMap((child) => {
      const { idleMaterial } = child.userData as { idleMaterial?: THREE.Material };
      return idleMaterial ? [idleMaterial] : [];
    });
    const disposed = faces.map((material) => vi.spyOn(material, 'dispose'));
    const labelDisposed = vi.spyOn(label, 'dispose');
    const labelTextureDisposed = vi.spyOn(label.map!, 'dispose');
    const lineDisposed = vi.spyOn(line, 'dispose');

    disposeViewportGizmoChildren(gizmo);

    expect(gizmo.children).toEqual([]);
    expect(faces.length).toBeGreaterThan(0);
    for (const spy of disposed) {
      expect(spy).toHaveBeenCalledOnce();
    }
    expect([labelDisposed, labelTextureDisposed, lineDisposed].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
    gizmo.dispose();
  });
});
