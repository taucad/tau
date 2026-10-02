import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

type FakeMaterial = {
  isMaterial: true;
  id: number;
  colorWrite: boolean;
  transparent: boolean;
  depthWrite: boolean;
  depthTest: boolean;
  clone: () => FakeMaterial;
  dispose: () => void;
  addEventListener: (event: string, callback: () => void) => void;
  removeEventListener: (event: string, callback: () => void) => void;
};

type FakeMesh = {
  isMesh: true;
  material: FakeMaterial | FakeMaterial[];
};

let nextMaterialId = 1;

const createFakeMaterial = (): FakeMaterial => {
  const id = nextMaterialId++;
  const disposeListeners: Array<() => void> = [];
  const self: FakeMaterial = {
    isMaterial: true,
    id,
    colorWrite: true,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    clone: () => {
      const cloned = createFakeMaterial();
      cloned.colorWrite = self.colorWrite;
      cloned.transparent = self.transparent;
      cloned.depthWrite = self.depthWrite;
      cloned.depthTest = self.depthTest;
      return cloned;
    },
    dispose: vi.fn(),
    addEventListener: (event: string, callback: () => void) => {
      if (event === 'dispose') {
        disposeListeners.push(callback);
      }
    },
    removeEventListener: (event: string, callback: () => void) => {
      if (event === 'dispose') {
        const index = disposeListeners.indexOf(callback);
        if (index !== -1) {
          disposeListeners.splice(index, 1);
        }
      }
    },
  };
  return self;
};

const hoistedMocks = vi.hoisted(() => {
  const traverseSpy = vi.fn();
  const sceneStub: { isScene: boolean; traverse: typeof traverseSpy } = {
    isScene: true,
    traverse: traverseSpy,
  };
  const cameraStub: { isCamera: boolean } = { isCamera: true };

  const gl = {
    autoClear: true,
    render: vi.fn(),
  };

  let priorityTwoFrameCallback: ((_state: Record<string, unknown>, delta: number) => void) | undefined;

  const reset = (): void => {
    priorityTwoFrameCallback = undefined;
    gl.autoClear = true;
    gl.render.mockClear();
    traverseSpy.mockReset();
  };

  const getPriorityTwoCallback = (): typeof priorityTwoFrameCallback => priorityTwoFrameCallback;

  const useFrameMock = (
    callback: (_state: Record<string, unknown>, delta: number) => void,
    priority?: number,
  ): void => {
    if (priority === 2) {
      priorityTwoFrameCallback = callback;
    }
  };

  return {
    cameraStub,
    getPriorityTwoCallback,
    gl,
    reset,
    sceneStub,
    traverseSpy,
    useFrameMock,
  };
});

/**
 * `createPortal` from @react-three/fiber assumes a live R3F render-root; under plain react-dom
 * (testing-library `render`) it throws. Stubbed to a no-op since the rendered overlay tree isn't
 * what we're asserting — we only care about the priority-2 `useFrame` body.
 */
vi.mock('@react-three/fiber', async (importOriginal) => {
  const fiberFacadeUnknown: unknown = await importOriginal();
  const fiberFacade =
    fiberFacadeUnknown !== null && typeof fiberFacadeUnknown === 'object'
      ? (fiberFacadeUnknown as Record<string, unknown>)
      : {};

  return {
    ...fiberFacade,
    createPortal: vi.fn(() => null),
    useFrame: vi.fn(hoistedMocks.useFrameMock),
  };
});

/**
 * Drive the priority-2 frame callback once. Returns the registered callback for follow-up
 * assertions (e.g. asserting `autoClear` post-restore).
 */
const tickPriorityTwoFrame = (): void => {
  const frameCallback = hoistedMocks.getPriorityTwoCallback();
  expect(frameCallback).toBeTypeOf('function');
  frameCallback!(
    {
      gl: hoistedMocks.gl,
      scene: hoistedMocks.sceneStub,
      camera: hoistedMocks.cameraStub,
    },
    0,
  );
};

describe('SceneOverlay (priority-2 traverse + clone-swap depth pre-pass + overlay render)', () => {
  beforeEach(() => {
    hoistedMocks.reset();
    nextMaterialId = 1;
  });

  it('does not subscribe to useFrame when overlayActive is false', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive={false}>child</SceneOverlay>);

    expect(hoistedMocks.getPriorityTwoCallback()).toBeUndefined();
  });

  it('subscribes to useFrame at priority 2 when overlayActive is true', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    expect(hoistedMocks.getPriorityTwoCallback()).toBeTypeOf('function');
  });

  it('traverses the main scene and renders twice per frame with autoClear=false (depth pre-pass + overlay)', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    const sourceMaterial = createFakeMaterial();
    const mesh: FakeMesh = { isMesh: true, material: sourceMaterial };
    hoistedMocks.traverseSpy.mockImplementation((visitor: (object: unknown) => void) => {
      visitor(mesh);
    });

    const autoClearDuringRender: boolean[] = [];
    hoistedMocks.gl.render.mockImplementation(() => {
      autoClearDuringRender.push(hoistedMocks.gl.autoClear);
    });

    tickPriorityTwoFrame();

    expect(hoistedMocks.traverseSpy).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.gl.render).toHaveBeenCalledTimes(2);
    expect(autoClearDuringRender).toEqual([false, false]);
  });

  it('first render targets the main scene (depth pre-pass) and second render targets the overlay scene', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    const sourceMaterial = createFakeMaterial();
    const mesh: FakeMesh = { isMesh: true, material: sourceMaterial };
    hoistedMocks.traverseSpy.mockImplementation((visitor: (object: unknown) => void) => {
      visitor(mesh);
    });

    tickPriorityTwoFrame();

    expect(hoistedMocks.gl.render).toHaveBeenCalledTimes(2);
    const firstCall = hoistedMocks.gl.render.mock.calls[0] as unknown as [unknown, unknown];
    const secondCall = hoistedMocks.gl.render.mock.calls[1] as unknown as [unknown, unknown];

    expect(firstCall[0]).toBe(hoistedMocks.sceneStub);
    expect(firstCall[1]).toBe(hoistedMocks.cameraStub);

    expect(secondCall[0]).not.toBe(hoistedMocks.sceneStub);
    expect((secondCall[0] as { isScene?: boolean }).isScene).toBe(true);
    expect(secondCall[1]).toBe(hoistedMocks.cameraStub);
  });

  it('swaps each renderable mesh to a depth-only clone before the pre-pass render and restores after', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    const sourceMaterial = createFakeMaterial();
    const mesh: FakeMesh = { isMesh: true, material: sourceMaterial };
    hoistedMocks.traverseSpy.mockImplementation((visitor: (object: unknown) => void) => {
      visitor(mesh);
    });

    let materialDuringPrePass: FakeMaterial | FakeMaterial[] | undefined;
    hoistedMocks.gl.render.mockImplementationOnce(() => {
      materialDuringPrePass = mesh.material;
    });

    tickPriorityTwoFrame();

    expect(materialDuringPrePass).toBeDefined();
    expect(materialDuringPrePass).not.toBe(sourceMaterial);
    const cloneUsed = materialDuringPrePass as FakeMaterial;
    expect(cloneUsed.colorWrite).toBe(false);
    expect(cloneUsed.transparent).toBe(false);
    expect(cloneUsed.depthWrite).toBe(true);
    expect(cloneUsed.depthTest).toBe(true);

    expect(mesh.material).toBe(sourceMaterial);
  });

  it('caches the depth-only clone per source material across frames (pipeline-cache friendly)', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    const sourceMaterial = createFakeMaterial();
    const mesh: FakeMesh = { isMesh: true, material: sourceMaterial };
    hoistedMocks.traverseSpy.mockImplementation((visitor: (object: unknown) => void) => {
      visitor(mesh);
    });

    let firstFrameClone: FakeMaterial | undefined;
    let secondFrameClone: FakeMaterial | undefined;

    hoistedMocks.gl.render.mockImplementationOnce(() => {
      firstFrameClone = mesh.material as FakeMaterial;
    });
    tickPriorityTwoFrame();

    hoistedMocks.gl.render.mockClear();
    hoistedMocks.gl.render.mockImplementationOnce(() => {
      secondFrameClone = mesh.material as FakeMaterial;
    });
    tickPriorityTwoFrame();

    expect(firstFrameClone).toBeDefined();
    expect(secondFrameClone).toBeDefined();
    expect(secondFrameClone).toBe(firstFrameClone);
  });

  it('skips non-renderable objects (no material / not isMesh) during traverse', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    const group = { isGroup: true };
    const camera = { isCamera: true };
    const light = { isLight: true };
    hoistedMocks.traverseSpy.mockImplementation((visitor: (object: unknown) => void) => {
      visitor(group);
      visitor(camera);
      visitor(light);
    });

    expect(() => {
      tickPriorityTwoFrame();
    }).not.toThrow();
    expect(hoistedMocks.gl.render).toHaveBeenCalledTimes(2);
  });

  it('handles a mesh with an array of materials (multi-material) — clones each entry and restores the array', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    const sourceA = createFakeMaterial();
    const sourceB = createFakeMaterial();
    const originalMaterialArray = [sourceA, sourceB];
    const mesh: FakeMesh = { isMesh: true, material: originalMaterialArray };
    hoistedMocks.traverseSpy.mockImplementation((visitor: (object: unknown) => void) => {
      visitor(mesh);
    });

    let materialDuringPrePass: FakeMaterial | FakeMaterial[] | undefined;
    hoistedMocks.gl.render.mockImplementationOnce(() => {
      materialDuringPrePass = mesh.material;
    });

    tickPriorityTwoFrame();

    expect(Array.isArray(materialDuringPrePass)).toBe(true);
    const cloneArray = materialDuringPrePass as FakeMaterial[];
    expect(cloneArray).toHaveLength(2);
    expect(cloneArray[0]).not.toBe(sourceA);
    expect(cloneArray[1]).not.toBe(sourceB);
    expect(cloneArray[0]!.colorWrite).toBe(false);
    expect(cloneArray[1]!.colorWrite).toBe(false);

    expect(mesh.material).toBe(originalMaterialArray);
  });

  it('restores gl.autoClear to its previous value after the frame body returns', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');

    render(<SceneOverlay overlayActive>child</SceneOverlay>);

    hoistedMocks.traverseSpy.mockImplementation(() => undefined);

    hoistedMocks.gl.autoClear = true;
    tickPriorityTwoFrame();
    expect(hoistedMocks.gl.autoClear).toBe(true);

    hoistedMocks.gl.autoClear = false;
    tickPriorityTwoFrame();
    expect(hoistedMocks.gl.autoClear).toBe(false);
  });
});
