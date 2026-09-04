import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

type RendererMock = { compileAsync?: ReturnType<typeof vi.fn>; coordinateSystem?: number };

const mocks = vi.hoisted(() => {
  const gl: RendererMock = {};
  const sceneBounds = { min: [-20, -10, -5], max: [20, 10, 5] };
  return {
    camera: { name: 'perspective' },
    cameraRig: {
      actorRef: {
        getSnapshot: () => ({ context: { view: { bounds: sceneBounds } } }),
        send: vi.fn(),
      },
      perspectiveCamera: { name: 'perspective', updateProjectionMatrix: vi.fn() },
      orthographicCamera: { name: 'orthographic', updateProjectionMatrix: vi.fn() },
    },
    graphicsActor: {
      send: vi.fn(),
      getSnapshot: () => ({
        context: {
          modelPointerClickSuppressionReasons: [],
          suppressNextModelPointerClick: false,
        },
      }),
    },
    gl,
    invalidate: vi.fn(),
    modelUnit: {
      focusedComponentId: undefined as string | undefined,
      hiddenComponentIds: [],
      hoveredComponentId: undefined,
      isolatedComponentIds: [],
      manifest: undefined,
      opacityByComponentId: {},
      selectedComponentIds: [],
    },
    renderFrame: {
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0],
      metersPerRenderUnit: 1,
    },
    sceneBounds,
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera: mocks.camera,
    controls: undefined,
    gl: mocks.gl,
    invalidate: mocks.invalidate,
    size: { height: 768, width: 1024 },
  }),
}));

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mocks.cameraRig,
  useGraphics: () => mocks.graphicsActor,
  useGraphicsSelector: () => false,
  useRenderFrame: () => mocks.renderFrame,
  useModelInteractionRef: () => mocks.graphicsActor,
  useModelInteractionSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: {} }),
}));

vi.mock('#machines/model-interaction.machine.js', () => ({
  deriveModelInteractionUnitId: () => 'unit:test',
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  createSectionViewRaycastClipState: () => undefined,
  useSectionView: () => ({ enableMesh: false, isActive: false, plane: undefined }),
}));

vi.mock('#components/geometry/graphics/metadata/gltf-component-manifest.js', () => ({
  buildGltfComponentManifest: () => ({
    capabilities: {
      canAdjustOpacity: false,
      canFocus: false,
      canHide: false,
      canIsolate: false,
      exports: [],
      hasDrawings: false,
      hasPreciseTopology: false,
    },
    nodeOrder: ['root'],
    nodesById: {
      root: {
        childIds: [],
        depth: 0,
        id: 'root',
        kind: 'model',
        materialIndices: [],
        meshNodeIndices: [],
        name: 'Model',
        path: ['Model'],
        primitiveIndices: [],
        selector: 'root',
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
    },
    rootId: 'root',
    schemaVersion: 1,
  }),
}));

const { GltfMesh } = await import('#components/geometry/graphics/three/react/gltf-mesh.js');

const createGltf = (): GLTF =>
  ({
    animations: [],
    cameras: [],
    parser: { associations: new Map() },
    scene: new Group(),
    scenes: [],
    userData: {},
  }) as unknown as GLTF;

describe('GltfMesh camera lifecycle', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.camera = { name: 'perspective' };
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: undefined };
    mocks.renderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0],
      metersPerRenderUnit: 1,
    };
    delete mocks.gl.compileAsync;
    delete mocks.gl.coordinateSystem;
  });

  it('warms the parsed model for both persistent endpoint cameras exactly once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    parseAsync.mockResolvedValue(createGltf());
    const compileAsync = vi.fn(async (_scene: unknown, _camera: unknown) => undefined);
    mocks.gl.compileAsync = compileAsync;
    mocks.gl.coordinateSystem = 2000;
    const gltfFile = new Uint8Array([1, 2, 3]);
    const view = render(<GltfMesh gltfFile={gltfFile} geometryHash='camera-warmup' enableMatcap={false} />);

    await waitFor(() => {
      expect(compileAsync).toHaveBeenCalledTimes(2);
    });
    expect(compileAsync.mock.calls.map((call) => call[1])).toEqual([
      mocks.cameraRig.perspectiveCamera,
      mocks.cameraRig.orthographicCamera,
    ]);

    mocks.camera = { name: 'orthographic' };
    view.rerender(<GltfMesh gltfFile={gltfFile} geometryHash='camera-warmup' enableMatcap={false} />);
    expect(compileAsync).toHaveBeenCalledTimes(2);
  });

  it('frames physical component bounds transiently and restores scene bounds when focus clears', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(createGltf());
    mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: 'root' };
    mocks.renderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [10, 20, 30],
      metersPerRenderUnit: 0.001,
    };

    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1, 2, 3])} geometryHash='focused-component' enableMatcap={false} />,
    );

    await waitFor(() => {
      expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(1, {
        type: 'frame',
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        margin: 0.1,
      });
      expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(2, {
        type: 'setBounds',
        bounds: mocks.sceneBounds,
      });
      expect(mocks.cameraRig.actorRef.send).toHaveBeenCalledTimes(2);
    });

    mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: undefined };
    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([1, 2, 3])} geometryHash='focused-component' enableMatcap={false} />,
    );

    await waitFor(() => {
      expect(mocks.cameraRig.actorRef.send).toHaveBeenLastCalledWith({
        type: 'setBounds',
        bounds: mocks.sceneBounds,
      });
      expect(mocks.cameraRig.actorRef.send).toHaveBeenCalledTimes(3);
    });
  });

  it('keeps the parsed scene mounted when the active camera identity changes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    parseAsync.mockResolvedValue(createGltf());
    const gltfFile = new Uint8Array([1, 2, 3]);
    const view = render(<GltfMesh gltfFile={gltfFile} geometryHash='camera-handoff' enableMatcap={false} />);

    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(1);
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });

    parseAsync.mockImplementationOnce(
      async () =>
        new Promise<GLTF>(() => {
          // A real reparse leaves the model absent until asynchronous parsing finishes.
        }),
    );
    mocks.camera = { name: 'orthographic' };
    view.rerender(<GltfMesh gltfFile={gltfFile} geometryHash='camera-handoff' enableMatcap={false} />);

    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(1);
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
  });
});
