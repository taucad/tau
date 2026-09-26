import { useLayoutEffect } from 'react';
import type { RenderFrame } from '@taucad/spatial';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type * as Fiber from '@react-three/fiber';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  Plane,
  PerspectiveCamera,
  Raycaster,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as sectionTopology from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import * as inPlaceGeometry from '#components/geometry/graphics/three/utils/in-place-geometry-update.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import * as bvhRaycast from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  applyModelMaterialAppearance,
  captureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';

type RendererMock = {
  compileAsync?: ReturnType<typeof vi.fn>;
  coordinateSystem?: number;
};

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
      perspectiveCamera: {
        name: 'perspective',
        coordinateSystem: undefined as number | undefined,
        updateProjectionMatrix: vi.fn(),
      },
      orthographicCamera: {
        name: 'orthographic',
        coordinateSystem: undefined as number | undefined,
        updateProjectionMatrix: vi.fn(),
      },
    },
    graphicsActor: {
      send: vi.fn(),
      getSnapshot: () => ({
        context: {
          modelPointerClickSuppressionReasons: [],
          suppressNextModelPointerClick: false,
          viewerHoverSuppressionReasons: [],
        },
      }),
    },
    gl,
    rootScene: { name: 'viewport-lighting-scene' },
    frameCallback: undefined as (() => void) | undefined,
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
      originMeters: [0, 0, 0] as [number, number, number],
      metersPerRenderUnit: 1,
    },
    sectionView: { enableMesh: false, isActive: false, plane: undefined },
    raycastClipState: undefined as RaycastClipState | undefined,
    sceneBounds,
  };
});

vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof Fiber>()),
  useFrame: (callback: () => void) => {
    mocks.frameCallback = callback;
  },
  useThree: () => ({
    camera: mocks.camera,
    controls: undefined,
    gl: mocks.gl,
    scene: mocks.rootScene,
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
  useRenderFrameRetarget: (handler: (frame: RenderFrame) => void) => {
    useLayoutEffect(() => {
      handler(mocks.renderFrame);
    }, [handler, mocks.renderFrame]);
  },
  useModelInteractionRef: () => mocks.graphicsActor,
  useModelInteractionSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: {} }),
}));

vi.mock('#machines/model-interaction.machine.js', () => ({
  deriveModelInteractionUnitId: () => 'unit:test',
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  createSectionViewRaycastClipState: () => mocks.raycastClipState,
  useSectionView: () => mocks.sectionView,
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
    mocks.graphicsActor.send.mockClear();
    mocks.frameCallback = undefined;
    mocks.invalidate.mockClear();
    mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: undefined };
    mocks.renderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0] as [number, number, number],
      metersPerRenderUnit: 1,
    };
    delete mocks.gl.compileAsync;
    delete mocks.gl.coordinateSystem;
    mocks.cameraRig.perspectiveCamera.coordinateSystem = undefined;
    mocks.cameraRig.orthographicCamera.coordinateSystem = undefined;
    mocks.sectionView = {
      enableMesh: false,
      isActive: false,
      plane: undefined,
    };
    mocks.raycastClipState = undefined;
  });

  it('warms the parsed model for both persistent endpoint cameras exactly once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    parseAsync.mockResolvedValue(createGltf());
    const compileAsync = vi.fn(async (_scene: unknown, _camera: unknown, _targetScene?: unknown) => undefined);
    mocks.gl.compileAsync = compileAsync;
    mocks.gl.coordinateSystem = 2001;
    const gltfFile = new Uint8Array([1, 2, 3]);
    const view = render(<GltfMesh gltfFile={gltfFile} geometryHash='camera-warmup' enableMatcap={false} />);

    await waitFor(() => {
      expect(compileAsync).toHaveBeenCalledTimes(2);
    });
    expect(compileAsync.mock.calls.map((call) => call[1])).toEqual([
      mocks.cameraRig.perspectiveCamera,
      mocks.cameraRig.orthographicCamera,
    ]);
    expect(compileAsync.mock.calls.map((call) => call[2])).toEqual([mocks.rootScene, mocks.rootScene]);
    expect(mocks.cameraRig.perspectiveCamera.coordinateSystem).toBe(2001);
    expect(mocks.cameraRig.orthographicCamera.coordinateSystem).toBe(2001);

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

  it('keeps A mounted while B parses and preserves A when B fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let rejectSecond: ((error: Error) => void) | undefined;
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    parseAsync.mockResolvedValueOnce(createGltf()).mockImplementationOnce(
      async () =>
        new Promise<GLTF>((_resolve, reject) => {
          rejectSecond = reject;
        }),
    );
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    const committedA = view.container.querySelector('primitive');

    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([2])} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(2);
    });
    expect(view.container.querySelector('primitive')).toBe(committedA);

    rejectSecond?.(new Error('invalid replacement'));
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });
    expect(view.container.querySelector('primitive')).toBe(committedA);
  });

  it('records zero model-empty browser frames across a successful A to B swap', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let finishSecond: ((gltf: GLTF) => void) | undefined;
    vi.spyOn(GLTFLoader.prototype, 'parseAsync')
      .mockResolvedValueOnce(createGltf())
      .mockImplementationOnce(
        async () =>
          new Promise<GLTF>((resolve) => {
            finishSecond = resolve;
          }),
      );
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    const frameCounts: number[] = [];
    const sampleFrame = async (): Promise<void> =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          frameCounts.push(view.container.querySelectorAll('primitive').length);
          resolve();
        });
      });

    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([2])} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await sampleFrame();
    await sampleFrame();
    finishSecond?.(createGltf());
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationCommitted', key: 'b' }),
      );
    });
    await sampleFrame();
    await sampleFrame();

    expect(frameCounts).toEqual([1, 1, 1, 1]);
  });

  it('never builds section topology while no section tool is armed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const analyze = vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(createGltf());
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='idle' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    mocks.frameCallback?.();
    // D27: the presentation settles its telemetry without any topology work at all.
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationMeasured' }),
      );
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(analyze).not.toHaveBeenCalled();
  });

  it('publishes one bounded telemetry record after the first frame of an unarmed presentation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(createGltf());
    const view = render(
      <GltfMesh
        gltfFile={new Uint8Array([1])}
        geometryHash='telemetry'
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    mocks.frameCallback?.();

    await waitFor(() => {
      const measured = mocks.graphicsActor.send.mock.calls
        .map(([event]) => event as { type?: string; telemetry?: Record<string, unknown> })
        .find((event) => event.type === 'gltfPresentationMeasured');
      expect(measured?.telemetry).toMatchObject({
        revision: 1,
        key: 'telemetry',
        outcome: 'presented',
        modelEmptyFrames: 0,
        committedBundleHighWaterMark: 1,
        candidateBundleHighWaterMark: 1,
      });
    });
    const telemetryEvents = mocks.graphicsActor.send.mock.calls.filter(
      ([event]) => (event as { type?: string }).type === 'gltfPresentationMeasured',
    );
    expect(telemetryEvents).toHaveLength(1);
  });

  it('retires shared scene resources exactly once after B commits', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = createGltf();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    first.scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const second = createGltf();
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    parseAsync.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });

    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([2])} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(geometryDispose).toHaveBeenCalledTimes(1);
    });
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes shared geometry, material, and texture once on unmount', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const gltf = createGltf();
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    gltf.scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });

    view.unmount();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps glass attenuation invariant across render scales without mutating authored materials', async () => {
    const gltf = createGltf();
    const authored = new MeshPhysicalMaterial({ transmission: 1, thickness: 0.0008, attenuationDistance: 0.02 });
    const mesh = new Mesh(new BoxGeometry(), authored);
    gltf.scene.add(mesh);
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const bytes = new Uint8Array([1]);
    mocks.renderFrame = { ...mocks.renderFrame, metersPerRenderUnit: 0.001 };
    const view = render(<GltfMesh gltfFile={bytes} enableMatcap={false} />);
    await waitFor(() => {
      expect(mesh.material.attenuationDistance).toBe(20);
    });
    expect(mesh.material.thickness).toBe(0.0008);
    expect(authored.attenuationDistance).toBe(0.02);
    const { material } = mesh;
    for (const metersPerRenderUnit of [1, 1e-6, 1000, 0.001]) {
      mocks.renderFrame = { ...mocks.renderFrame, metersPerRenderUnit };
      view.rerender(<GltfMesh gltfFile={bytes} enableMatcap={false} />);
      expect(mesh.material).toBe(material);
      expect(mesh.material.attenuationDistance * metersPerRenderUnit).toBeCloseTo(0.02, 12);
      expect(mesh.material.thickness).toBe(0.0008);
    }
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('should isolate initially shared PBR materials for component dimming and dispose their owned resources once', async () => {
    const gltf = createGltf();
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({
      color: 0x28_5e_88,
      metalness: 0.65,
      roughness: 0.32,
      map: texture,
    });
    const first = new Mesh(geometry, material);
    const second = new Mesh(geometry, material);
    gltf.scene.add(first, second);
    const originalDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const view = render(<GltfMesh gltfFile={new Uint8Array([1])} enableMatcap={false} />);
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });

    expect(first.material === second.material).toBe(false);
    const firstDispose = vi.spyOn(first.material, 'dispose');
    const secondDispose = vi.spyOn(second.material, 'dispose');
    applyModelMaterialAppearance(first.material, captureModelMaterialAppearance(first.material), 0.25);
    expect(first.material.opacity).toBe(0.25);
    expect(second.material.opacity).toBe(1);
    expect(material.opacity).toBe(1);
    for (const surface of [first, second]) {
      expect(surface.material.color.getHex()).toBe(0x28_5e_88);
      expect(surface.material.metalness).toBe(0.65);
      expect(surface.material.roughness).toBe(0.32);
      expect(surface.material.map).toBe(texture);
    }

    view.unmount();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it('should dispatch nearest visible model hits without stock child triangle raycasts', async () => {
    const gltf = createGltf();
    const near = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const far = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    near.position.z = -2;
    far.position.z = -4;
    gltf.scene.add(near, far);
    const originalRaycast = gltf.scene.raycast;
    const nearRaycast = vi.spyOn(near, 'raycast');
    const farRaycast = vi.spyOn(far, 'raycast');
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const bytes = new Uint8Array([1]);
    const view = render(<GltfMesh gltfFile={bytes} enableMatcap={false} />);
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    for (const mesh of [near, far]) {
      setModelComponentOwner(mesh, { unitId: 'unit:test', componentId: 'root' });
    }
    gltf.scene.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(), new Vector3(0, 0, -1));
    const hits = raycaster.intersectObject(gltf.scene, true);
    expect(hits.length).toBe(1);
    expect(hits[0]?.object).toBe(near);
    expect(nearRaycast).not.toHaveBeenCalled();
    expect(farRaycast).not.toHaveBeenCalled();

    raycaster.ray.origin.x = 10;
    expect(raycaster.intersectObject(gltf.scene, true)).toEqual([]);
    raycaster.ray.origin.x = 0;
    mocks.raycastClipState = { enabled: true, planes: [new Plane(new Vector3(0, 0, -1), -3)] };
    mocks.sectionView = { ...mocks.sectionView, isActive: true };
    view.rerender(<GltfMesh gltfFile={bytes} enableMatcap={false} />);
    expect(raycaster.intersectObject(gltf.scene, true).map((hit) => hit.object)).toEqual([far]);
    expect(nearRaycast).not.toHaveBeenCalled();
    expect(farRaycast).not.toHaveBeenCalled();

    view.unmount();
    expect(gltf.scene.raycast).toBe(originalRaycast);
  });

  it('should reuse the authoritative R3F hit for hover, selection and the secondary-pointer menu', async () => {
    const gltf = createGltf();
    const near = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const far = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    near.position.z = -2;
    far.position.z = -4;
    gltf.scene.add(near, far);
    const originalRaycast = gltf.scene.raycast;
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const raycast = vi.spyOn(bvhRaycast, 'raycastFirstVisibleMeshHit');
    const secondaryPointer = vi.fn();
    const canvas = document.createElement('canvas');
    const renderer = Object.create(WebGLRenderer.prototype) as WebGLRenderer;
    Object.defineProperties(renderer, {
      dispose: { value: vi.fn() },
      domElement: { value: canvas },
      render: { value: vi.fn() },
      setPixelRatio: { value: vi.fn() },
      setSize: { value: vi.fn() },
      outputColorSpace: { value: '', writable: true },
      toneMapping: { value: 0, writable: true },
      toneMappingExposure: { value: 1, writable: true },
    });
    extend({ Group });
    const root = createRoot(canvas);
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    const bytes = new Uint8Array([1]);
    const element = (
      <GltfMesh gltfFile={bytes} enableMatcap={false} onModelComponentSecondaryPointerCandidate={secondaryPointer} />
    );
    try {
      await act(async () => {
        await root.configure({
          camera,
          events: createPointerEvents,
          frameloop: 'never',
          gl: renderer,
          size: { width: 800, height: 800, top: 0, left: 0 },
        });
      });
      const store = root.render(element);
      await waitFor(() => {
        expect(gltf.scene.raycast).not.toBe(originalRaycast);
      });
      setModelComponentOwner(near, { unitId: 'unit:test', componentId: 'near' });
      setModelComponentOwner(far, { unitId: 'unit:test', componentId: 'far' });
      store.getState().scene.updateMatrixWorld(true);
      const nearCenter = near.getWorldPosition(new Vector3());
      const farCenter = far.getWorldPosition(new Vector3());
      const direction = farCenter.clone().sub(nearCenter).normalize();
      camera.position.copy(nearCenter).addScaledVector(direction, -5);
      camera.lookAt(farCenter);
      camera.updateMatrixWorld(true);
      const pointer = mock<PointerEvent>({ offsetX: 400, offsetY: 400, pointerId: 1, button: 0, target: canvas });
      const secondaryPointerEvent = mock<PointerEvent>({
        offsetX: 400,
        offsetY: 400,
        pointerId: 1,
        button: 2,
        target: canvas,
      });
      const { handlers } = store.getState().events;

      raycast.mockClear();
      await act(async () => handlers?.onPointerMove(pointer));
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'setHoveredModelComponent',
        unitId: 'unit:test',
        componentId: 'near',
        source: 'viewer',
      });
      expect(raycast).toHaveBeenCalledTimes(1);

      await act(async () => handlers?.onPointerDown(pointer));
      raycast.mockClear();
      await act(async () => handlers?.onClick(pointer));
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'toggleModelComponentSelection',
        unitId: 'unit:test',
        componentId: 'near',
        source: 'viewer',
      });
      expect(raycast).toHaveBeenCalledTimes(1);

      near.layers.set(1);
      raycast.mockClear();
      await act(async () => handlers?.onPointerDown(secondaryPointerEvent));
      expect(secondaryPointer).toHaveBeenLastCalledWith({ unitId: 'unit:test', componentId: 'far' });
      expect(raycast).toHaveBeenCalledTimes(1);

      near.layers.set(0);
      mocks.raycastClipState = {
        enabled: true,
        planes: [
          new Plane().setFromNormalAndCoplanarPoint(direction, nearCenter.clone().add(farCenter).multiplyScalar(0.5)),
        ],
      };
      mocks.sectionView = { ...mocks.sectionView, isActive: true };
      await act(async () => {
        root.render(
          <GltfMesh
            gltfFile={bytes}
            enableMatcap={false}
            onModelComponentSecondaryPointerCandidate={secondaryPointer}
          />,
        );
      });
      raycast.mockClear();
      await act(async () => handlers?.onPointerDown(secondaryPointerEvent));
      expect(secondaryPointer).toHaveBeenLastCalledWith({ unitId: 'unit:test', componentId: 'far' });
      expect(raycast).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('should dispose parsed material snapshots if presentation preparation fails after cloning', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gltf = createGltf();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    gltf.scene.add(new Mesh(new BoxGeometry(), material));
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    vi.spyOn(inPlaceGeometry, 'captureInPlaceGeometryTargets').mockImplementation(() => {
      throw new Error('presentation preparation failed');
    });
    render(<GltfMesh gltfFile={new Uint8Array([1])} enableMatcap={false} />);
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationFailed' }),
      );
    });

    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps one model attached and disposes every resource once through a ten-replacement soak', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const resources = Array.from({ length: 11 }, () => {
      const gltf = createGltf();
      const geometry = new BoxGeometry();
      const texture = new Texture();
      const material = new MeshBasicMaterial({ map: texture });
      gltf.scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
      return {
        gltf,
        geometryDispose: vi.spyOn(geometry, 'dispose'),
        materialDispose: vi.spyOn(material, 'dispose'),
        textureDispose: vi.spyOn(texture, 'dispose'),
      };
    });
    let parseIndex = 0;
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => resources[parseIndex++]!.gltf);
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([0])} geometryHash='0' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelectorAll('primitive')).toHaveLength(1);
    });

    for (let index = 1; index <= 10; index += 1) {
      view.rerender(
        <GltfMesh
          gltfFile={new Uint8Array([index])}
          geometryHash={`${index}`}
          presentationRevision={index + 1}
          enableMatcap={false}
        />,
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential commits are the behavior under test.
      await waitFor(() => {
        expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'gltfPresentationCommitted', key: `${index}` }),
        );
      });
      expect(view.container.querySelectorAll('primitive')).toHaveLength(1);
    }
    view.unmount();

    for (const resource of resources) {
      expect(resource.geometryDispose).toHaveBeenCalledTimes(1);
      expect(resource.materialDispose).toHaveBeenCalledTimes(1);
      expect(resource.textureDispose).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps the complete active-section model until its analyzed replacement commits', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.sectionView = { enableMesh: true, isActive: true, plane: undefined };
    let finishSecond: (() => void) | undefined;
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        async () =>
          new Promise<Awaited<ReturnType<typeof sectionTopology.registerGltfSectionSurfaceSources>>>((resolve) => {
            finishSecond = () => {
              resolve([]);
            };
          }),
      );
    vi.spyOn(GLTFLoader.prototype, 'parseAsync')
      .mockResolvedValueOnce(createGltf())
      .mockResolvedValueOnce(createGltf());
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    const committedA = view.container.querySelector('primitive');
    const attachedCounts: number[] = [];
    const observer = new MutationObserver(() => {
      attachedCounts.push(view.container.querySelectorAll('primitive').length);
    });
    observer.observe(view.container, { childList: true, subtree: true });

    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([2])} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(sectionTopology.registerGltfSectionSurfaceSources).toHaveBeenCalledTimes(2);
    });
    expect(view.container.querySelector('primitive')).toBe(committedA);
    finishSecond?.();
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationCommitted', key: 'b' }),
      );
    });
    observer.disconnect();
    expect(attachedCounts).not.toContain(0);
  });

  it('preserves A when active-section analysis of B fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.sectionView = { enableMesh: true, isActive: true, plane: undefined };
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('topology failed'));
    vi.spyOn(GLTFLoader.prototype, 'parseAsync')
      .mockResolvedValueOnce(createGltf())
      .mockResolvedValueOnce(createGltf());
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    const committedA = view.container.querySelector('primitive');

    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([2])} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationFailed', key: 'b' }),
      );
    });
    expect(view.container.querySelector('primitive')).toBe(committedA);
  });

  it('cannot let a late B completion clear the queued C candidate', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.sectionView = { enableMesh: true, isActive: true, plane: undefined };
    let finishSecond: (() => void) | undefined;
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        async () =>
          new Promise<Awaited<ReturnType<typeof sectionTopology.registerGltfSectionSurfaceSources>>>((resolve) => {
            finishSecond = () => {
              resolve([]);
            };
          }),
      )
      .mockResolvedValueOnce([]);
    const parseAsync = vi
      .spyOn(GLTFLoader.prototype, 'parseAsync')
      .mockResolvedValueOnce(createGltf())
      .mockResolvedValueOnce(createGltf())
      .mockResolvedValueOnce(createGltf());
    const view = render(
      <GltfMesh gltfFile={new Uint8Array([1])} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([2])} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(sectionTopology.registerGltfSectionSurfaceSources).toHaveBeenCalledTimes(2);
    });
    view.rerender(
      <GltfMesh gltfFile={new Uint8Array([3])} geometryHash='c' presentationRevision={3} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(3);
    });
    finishSecond?.();

    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationCommitted', key: 'c' }),
      );
    });
    expect(mocks.graphicsActor.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gltfPresentationCommitted', key: 'b' }),
    );
    expect(view.container.querySelectorAll('primitive')).toHaveLength(1);
  });
});
