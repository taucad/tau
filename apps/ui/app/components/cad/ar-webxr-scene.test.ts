import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, Texture } from 'three';
import type * as Three from 'three';
import type { Group, Object3D } from 'three';
import { presentGlbInArSession } from '#components/cad/ar-webxr-scene.js';

// The jsdom environment has no WebGL, so the renderer is the one faked piece of Three.js; the scene graph, bounds and placement maths
// run for real. The parsed GLB is a 0.2 m cube standing 0.1 m below its origin.
const mocks = vi.hoisted(() => ({
  renderer: undefined as unknown as FakeRenderer,
  gltfScene: undefined as unknown as Object3D,
}));

type FakeRenderer = {
  loop: ((time: number, frame: unknown) => void) | undefined;
  rendered: Scene[];
  camera: { position: { x: number; y: number; z: number } };
  setPixelRatio: ReturnType<typeof vi.fn>;
  // oxlint-disable-next-line typescript/no-restricted-types -- Three.js stops the loop with null.
  setAnimationLoop: (loop: FakeRenderer['loop'] | null) => void;
  render: (scene: Scene) => void;
  dispose: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
  xr: Record<string, unknown>;
};

vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof Three>()),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js's own export name.
  WebGLRenderer: vi.fn(function () {
    return mocks.renderer;
  }),
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js's own export name.
  GLTFLoader: vi.fn(function () {
    return { parseAsync: async () => ({ scene: mocks.gltfScene }) };
  }),
}));

function createRenderer(): FakeRenderer {
  const renderer: FakeRenderer = {
    loop: undefined,
    rendered: [],
    camera: { position: { x: 0, y: 1.6, z: 0 } },
    setPixelRatio: vi.fn(),
    setAnimationLoop(loop) {
      renderer.loop = loop ?? undefined;
    },
    render(scene) {
      renderer.rendered.push(scene);
    },
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    xr: {
      enabled: false,
      setReferenceSpaceType: vi.fn(),
      setSession: async () => undefined,
      getCamera: () => renderer.camera,
      getReferenceSpace: () => ({}),
    },
  };
  return renderer;
}

class FakeSession extends EventTarget {
  public readonly hitTestSource = {
    cancel: vi.fn(() => {
      throw new DOMException('Session ended', 'InvalidStateError');
    }),
  };

  public hasHitTest = true;

  public async requestReferenceSpace(): Promise<Record<string, unknown>> {
    return {};
  }

  public async requestHitTestSource(): Promise<unknown> {
    if (!this.hasHitTest) {
      throw new DOMException('hit-test was not granted', 'NotSupportedError');
    }

    return this.hitTestSource;
  }
}

let geometry: BoxGeometry;
let map: Texture;

beforeEach(() => {
  mocks.renderer = createRenderer();
  geometry = new BoxGeometry(0.2, 0.2, 0.2);
  map = new Texture();
  const scene = new Scene();
  scene.add(new Mesh(geometry, new MeshStandardMaterial({ map })));
  mocks.gltfScene = scene;
});

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const modelOf = (renderer: FakeRenderer): Group =>
  renderer.rendered[0]!.children.find((child) => child.children.includes(mocks.gltfScene)) as Group;
/** A hit test result whose pose stands at the given point. */
const frameHitting = (x: number, y: number, z: number): unknown => ({
  getHitTestResults: () => [
    {
      getPose: () => ({ transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1] } }),
    },
  ],
});

describe('presentGlbInArSession', () => {
  it('places the model on the hit-tested floor at the tap, facing the viewer, standing on its lowest point', async () => {
    const session = new FakeSession();
    const onPlaced = vi.fn();
    await presentGlbInArSession(session as unknown as XRSession, glb, { onPlaced });

    const { renderer } = mocks;
    renderer.loop?.(0, frameHitting(0, 0, 0));
    const model = modelOf(renderer);
    expect(model.visible).toBe(false);
    expect(onPlaced).not.toHaveBeenCalled();

    renderer.loop?.(0, frameHitting(0.5, 0, -2));
    session.dispatchEvent(new Event('select'));
    expect(model.visible).toBe(true);
    expect(model.position.toArray()).toEqual([0.5, 0, -2]);
    // The cube's centre sits over the placement and its base on the floor.
    expect(mocks.gltfScene.position.x).toBeCloseTo(0);
    expect(mocks.gltfScene.position.y).toBeCloseTo(0.1);
    expect(mocks.gltfScene.position.z).toBeCloseTo(0);
    // +Z (glTF forward) turns towards the viewer at the origin.
    expect(model.rotation.y).toBeCloseTo(Math.atan2(-0.5, 2));
    expect(onPlaced).toHaveBeenCalledTimes(1);
  });

  it('stands the model in front of the starting pose when hit testing is not granted', async () => {
    const session = new FakeSession();
    session.hasHitTest = false;
    const onPlaced = vi.fn();
    await presentGlbInArSession(session as unknown as XRSession, glb, { onPlaced });

    mocks.renderer.loop?.(0, {});
    const model = modelOf(mocks.renderer);
    expect(model.visible).toBe(true);
    expect(model.position.z).toBeLessThanOrEqual(-1.2);
    expect(onPlaced).toHaveBeenCalledTimes(1);
  });

  it('disposes geometry, textures and the WebGL context even though the ended session refuses cancel()', async () => {
    const session = new FakeSession();
    const dispose = await presentGlbInArSession(session as unknown as XRSession, glb, { onPlaced: vi.fn() });
    // The reticle has found the floor, so a tap would place the model if placement were still listening.
    mocks.renderer.loop?.(0, frameHitting(1, 0, -1));
    const model = modelOf(mocks.renderer);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const mapDispose = vi.spyOn(map, 'dispose');

    expect(() => {
      dispose();
    }).not.toThrow();
    expect(session.hitTestSource.cancel).toHaveBeenCalled();
    expect(mocks.renderer.loop).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalled();
    expect(mapDispose).toHaveBeenCalled();
    expect(mocks.renderer.dispose).toHaveBeenCalled();
    expect(mocks.renderer.forceContextLoss).toHaveBeenCalled();
    // Placement stops with the scene.
    session.dispatchEvent(new Event('select'));
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.visible).toBe(false);
  });
  it('frees the renderer and the parsed model when the session cannot be attached', async () => {
    const session = new FakeSession();
    const { renderer } = mocks;
    const refused = new DOMException('The session already ended', 'InvalidStateError');
    renderer.xr['setSession'] = async () => {
      throw refused;
    };
    const disposeGeometry = vi.spyOn(geometry, 'dispose');

    await expect(presentGlbInArSession(session as unknown as XRSession, glb, { onPlaced: vi.fn() })).rejects.toBe(
      refused,
    );
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(disposeGeometry).toHaveBeenCalled();
  });
});
