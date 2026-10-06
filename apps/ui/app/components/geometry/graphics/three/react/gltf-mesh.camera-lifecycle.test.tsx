import { writeGlb } from '@taucad/geometry-core';
import type * as ModelInteraction from '#machines/model-interaction.machine.js';
import type * as GltfManifest from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { useLayoutEffect } from 'react';
import { createActor } from 'xstate';
import type { Actor, ActorRefFrom } from 'xstate';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import type { RenderFrame } from '@taucad/spatial';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type * as Fiber from '@react-three/fiber';
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';
import * as sectionTopology from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import * as bvhRaycast from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  applyModelMaterialAppearance,
  captureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import { createSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import type { SectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';

const cameraFixtureGlb = (revision: number): Uint8Array<ArrayBuffer> =>
  writeGlb({
    nodes: [],
    extras: { revision },
  });

type RendererMock = {
  compileAsync?: ReturnType<typeof vi.fn>;
  coordinateSystem?: number;
};

const mocks = vi.hoisted(() => {
  const gl: RendererMock = {};
  const sceneBounds = { min: [-20, -10, -5], max: [20, 10, 5] };
  const viewerHoverSuppressionReasons: string[] = [];
  return {
    viewerHoverSuppressionReasons,
    noHoveredComponentIds: [] as readonly string[],
    kinematics: undefined as ActorRefFrom<typeof kinematicsMachine> | undefined,
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
          assemblyDetailCalibration: undefined,
          isMeasureActive: false,
          measurements: [],
          modelPointerClickSuppressionReasons: [],
          suppressNextModelPointerClick: false,
          viewerHoverSuppressionReasons,
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
    sectionView: { isActive: false },
    raycastClipState: undefined as RaycastClipState | undefined,
    sceneBounds,
    backend: 'webgl' as 'webgl' | 'webgpu',
    sectionClip: undefined as SectionClip | undefined,
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
  useThreeGraphicsBackend: () => mocks.backend,
}));

vi.mock('#components/geometry/graphics/three/react/section-clipping-group.js', () => ({
  useSectionClip: () => mocks.sectionClip,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mocks.cameraRig,
  useGraphics: () => mocks.graphicsActor,
  useGraphicsSelector: (selector: (snapshot: ReturnType<typeof mocks.graphicsActor.getSnapshot>) => unknown) =>
    selector(mocks.graphicsActor.getSnapshot()),
  useRenderFrame: () => mocks.renderFrame,
  useRenderFrameRetarget: (handler: (frame: RenderFrame) => void) => {
    useLayoutEffect(() => {
      handler(mocks.renderFrame);
    }, [handler, mocks.renderFrame]);
  },
  useModelInteractionRef: () => mocks.graphicsActor,
  useKinematicsRef: () => mocks.kinematics,
  useModelInteractionSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: {} }),
  // No kinematics unit hovers a component; one stable list keeps the model's visual state unchanged.
  useKinematicsSelector: () => mocks.noHoveredComponentIds,
}));

vi.mock('#machines/model-interaction.machine.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ModelInteraction>()),
  deriveModelInteractionUnitId: () => 'unit:test',
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => mocks.raycastClipState,
  useSectionViewFlags: () => mocks.sectionView,
}));

vi.mock('#components/geometry/graphics/three/react/kinematics-viewer.js', () => ({
  useKinematicsViewer: () => () => undefined,
}));

vi.mock('#components/geometry/graphics/metadata/gltf-component-manifest.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GltfManifest>()),
  gltfPrimitiveOccurrenceKey: ({
    nodeIndex,
    meshIndex,
    primitiveIndex,
  }: {
    nodeIndex: number;
    meshIndex: number;
    primitiveIndex: number;
  }) => `${nodeIndex}/${meshIndex}/${primitiveIndex}`,
  prepareGltfMetadata: () => ({
    parsed: { json: {}, bin: undefined },
    getMeasurementFeatures: () => new Map(),
    manifest: {
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
    },
  }),
}));

const { GltfMesh, collectModelPickableSurfaceMeshes } =
  await import('#components/geometry/graphics/three/react/gltf-mesh.js');

/** A raycast clip that removes the points past the plane through `point`, along `normal`. */
const clipBeyond = (normal: Vector3, point: Vector3): RaycastClipState => {
  const halfSpace = { normal: [normal.x, normal.y, normal.z] as const, constant: normal.dot(point) };
  return {
    enabled: true,
    pieces: [{ cutId: 'cut', halfSpaces: [halfSpace], faces: [{ cutId: 'cut', plane: halfSpace, bounds: [] }] }],
  };
};

const createGltf = (): GLTF => ({
  asset: { version: '2.0' },
  animations: [],
  cameras: [],
  parser: Object.assign(mock<GLTF['parser']>(), {
    associations: new Map(),
    json: { asset: { version: '2.0' }, nodes: [] },
    extensions: {},
  } satisfies Partial<GLTF['parser']>),
  scene: new Group(),
  scenes: [],
  userData: {},
});

/** Presents on `backend`, whose viewer clip is a fresh one. */
const presentOn = (backend: 'webgl' | 'webgpu'): SectionClip => {
  const clip = createSectionClip(backend);
  mocks.backend = backend;
  mocks.sectionClip = clip;
  return clip;
};

/** A parsed model with each kind a GLB draws: a surface, edges, a line strip and points. */
const createClippableGltf = (): GLTF => {
  const gltf = createGltf();
  const positions = (): BufferGeometry =>
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  gltf.scene.add(
    new Mesh(positions(), new MeshStandardMaterial()),
    new LineSegments(positions(), new LineBasicMaterial()),
    new Line(positions(), new LineBasicMaterial()),
    new Points(positions(), new PointsMaterial()),
  );
  return gltf;
};

/** Whether `material` compiles in `clip`: WebGPU keys its pipeline on the mask, WebGL its program on the clip. */
const carriesClip = (material: Material, clip: SectionClip): boolean =>
  clip.backend === 'webgpu'
    ? (material as Material & { maskNode?: unknown }).maskNode === clip.mask
    : material.customProgramCacheKey().endsWith('|tau-section-clip-v1');

/** Per drawn kind of `scene` (the edges are fat lines by then), whether its material compiles in `clip`. */
const clipByKind = (scene: Object3D, clip: SectionClip): Record<string, boolean> => {
  const carried: Record<string, boolean> = {};
  scene.traverse((object) => {
    const { material } = object as Partial<Mesh>;
    if (material && !Array.isArray(material)) {
      carried[object.type] = carriesClip(material, clip);
    }
  });
  return carried;
};

const clippedKinds = { Mesh: true, LineSegments2: true, Line: true, Points: true };

/** Per committed revision, {@link clipByKind} of its scene at the moment it commits. */
const recordClipAtCommit = (gltfs: readonly GLTF[], clip: SectionClip): Map<number, Record<string, boolean>> => {
  const atCommit = new Map<number, Record<string, boolean>>();
  mocks.graphicsActor.send.mockImplementation((event: { type: string; revision?: number }) => {
    const gltf = gltfs[(event.revision ?? 0) - 1];
    if (event.type === 'gltfPresentationCommitted' && gltf) {
      atCommit.set(event.revision!, clipByKind(gltf.scene, clip));
    }
  });
  return atCommit;
};

describe('GltfMesh camera lifecycle', () => {
  let kinematics: Actor<typeof kinematicsMachine> | undefined;
  beforeEach(() => {
    kinematics = createActor(kinematicsMachine, { input: {} }).start();
    mocks.kinematics = kinematics;
    presentOn('webgl');
    clearRendererSpans();
  });

  afterEach(() => {
    cleanup();
    kinematics?.stop();
    vi.restoreAllMocks();
    mocks.camera = { name: 'perspective' };
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.graphicsActor.send.mockReset();
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
    mocks.sectionView = { isActive: false };
    mocks.raycastClipState = undefined;
    mocks.viewerHoverSuppressionReasons.length = 0;
  });

  it('should commit the active scene without compiling a detached context or inactive projection', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(createGltf());
    const compileAsync = vi.fn();
    mocks.gl.compileAsync = compileAsync;
    const gltfFile = cameraFixtureGlb(1);
    const view = render(<GltfMesh gltfFile={gltfFile} geometryHash='active' enableMatcap={false} />);
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    mocks.camera = { name: 'orthographic' };
    view.rerender(<GltfMesh gltfFile={gltfFile} geometryHash='active' enableMatcap={false} />);
    expect(parseAsync).toHaveBeenCalledTimes(1);
    expect(compileAsync).not.toHaveBeenCalled();
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='focused-component' enableMatcap={false} />,
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
    view.rerender(<GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='focused-component' enableMatcap={false} />);

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
    const gltfFile = cameraFixtureGlb(1);
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    const committedA = view.container.querySelector('primitive');

    view.rerender(
      <GltfMesh gltfFile={cameraFixtureGlb(2)} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
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
      <GltfMesh gltfFile={cameraFixtureGlb(2)} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='idle' presentationRevision={1} enableMatcap={false} />,
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
        gltfFile={cameraFixtureGlb(1)}
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

  it('records deferred Section timings without duplicating first-frame telemetry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(createGltf());
    const analyze = vi
      .spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
      .mockImplementation(async (options) => {
        options.onTiming?.({
          submitMilliseconds: 3,
          packMilliseconds: 2,
          workerMilliseconds: 7,
          hydrateMilliseconds: 1,
          resolveMilliseconds: 10,
        });
        return [];
      });
    const content = cameraFixtureGlb(1);
    const view = render(
      <GltfMesh gltfFile={content} geometryHash='deferred' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    mocks.frameCallback?.();
    expect(analyze).not.toHaveBeenCalled();
    mocks.sectionView = { isActive: true };
    view.rerender(
      <GltfMesh gltfFile={content} geometryHash='deferred' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      const analysisSpans = rendererSpans().filter((span) => span.name === 'renderer.section-topology');
      expect(analysisSpans).toHaveLength(1);
      expect(analysisSpans[0]?.detail).toMatchObject({
        key: 'deferred',
        revision: 1,
        backend: 'webgl',
        packMilliseconds: 2,
        workerMilliseconds: 7,
        resolveMilliseconds: 10,
      });
    });
    expect(
      mocks.graphicsActor.send.mock.calls.filter(
        ([event]) => (event as { type?: string }).type === 'gltfPresentationMeasured',
      ),
    ).toHaveLength(1);
    expect(analyze).toHaveBeenCalledTimes(1);
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });

    view.rerender(
      <GltfMesh gltfFile={cameraFixtureGlb(2)} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
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
    const bytes = cameraFixtureGlb(1);
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
    const view = render(<GltfMesh gltfFile={cameraFixtureGlb(1)} enableMatcap={false} />);
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
    const bytes = cameraFixtureGlb(1);
    const view = render(<GltfMesh gltfFile={bytes} enableMatcap={false} />);
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    for (const mesh of [near, far]) {
      setModelComponentOwner(mesh, { unitId: 'unit:test', componentId: 'root' });
    }
    gltf.scene.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(), new Vector3(0, 0, -1));
    expect(collectModelPickableSurfaceMeshes(gltf.scene)).toContain(near);
    expect(near.visible).toBe(true);
    expect(gltf.scene.visible).toBe(true);
    expect(bvhRaycast.raycastFirstVisibleMeshHit({ raycaster, meshes: [near, far] })?.object).toBe(near);
    const hits = raycaster.intersectObject(gltf.scene, true);
    expect(hits.length).toBe(1);
    expect(hits[0]?.object).toBe(near);
    expect(nearRaycast).not.toHaveBeenCalled();
    expect(farRaycast).not.toHaveBeenCalled();

    raycaster.ray.origin.x = 10;
    expect(raycaster.intersectObject(gltf.scene, true)).toEqual([]);
    raycaster.ray.origin.x = 0;
    mocks.raycastClipState = clipBeyond(new Vector3(0, 0, 1), new Vector3(0, 0, -3));
    mocks.sectionView = { ...mocks.sectionView, isActive: true };
    view.rerender(<GltfMesh gltfFile={bytes} enableMatcap={false} />);
    expect(raycaster.intersectObject(gltf.scene, true).map((hit) => hit.object)).toEqual([far]);
    expect(nearRaycast).not.toHaveBeenCalled();
    expect(farRaycast).not.toHaveBeenCalled();

    view.unmount();
    expect(gltf.scene.raycast).toBe(originalRaycast);
  });

  it('should clip model hits with the section plane current at raycast time, without re-rendering', async () => {
    const gltf = createGltf();
    const near = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const far = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    near.position.z = -2;
    far.position.z = -4;
    gltf.scene.add(near, far);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const view = render(<GltfMesh gltfFile={cameraFixtureGlb(1)} enableMatcap={false} />);
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    for (const mesh of [near, far]) {
      setModelComponentOwner(mesh, { unitId: 'unit:test', componentId: 'root' });
    }
    gltf.scene.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(), new Vector3(0, 0, -1));
    expect(raycaster.intersectObject(gltf.scene, true).map((hit) => hit.object)).toEqual([near]);

    // A section drag step moves the cut without re-rendering the model; the next raycast still honours it.
    mocks.raycastClipState = clipBeyond(new Vector3(0, 0, 1), new Vector3(0, 0, -3));
    expect(raycaster.intersectObject(gltf.scene, true).map((hit) => hit.object)).toEqual([far]);

    view.unmount();
  });

  it('should skip camera-drag hover queries but retain R3F press, click and restored hover hits', async () => {
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
    const bytes = cameraFixtureGlb(1);
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
      mocks.viewerHoverSuppressionReasons.push('cameraControls');
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
      await act(async () => handlers?.onPointerMove(pointer));
      expect(raycast).not.toHaveBeenCalled();

      await act(async () => handlers?.onPointerDown(pointer));
      await act(async () => handlers?.onPointerDown(secondaryPointerEvent));
      await act(async () => handlers?.onClick(pointer));
      expect(raycast).toHaveBeenCalledTimes(3);
      expect(secondaryPointer).toHaveBeenLastCalledWith({ unitId: 'unit:test', componentId: 'near' });

      mocks.viewerHoverSuppressionReasons.length = 0;
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
      await act(async () => handlers?.onPointerMove(pointer));
      expect(raycast).toHaveBeenCalledOnce();
      raycast.mockClear();
      await act(async () => handlers?.onClick(pointer));
      expect(raycast).toHaveBeenCalledOnce();

      mocks.raycastClipState = clipBeyond(
        direction.clone().negate(),
        nearCenter.clone().add(farCenter).multiplyScalar(0.5),
      );
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
    vi.spyOn(material, 'clone').mockImplementation(() => {
      throw new Error('presentation preparation failed');
    });
    render(<GltfMesh gltfFile={cameraFixtureGlb(1)} enableMatcap={false} />);
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
      <GltfMesh gltfFile={cameraFixtureGlb(0)} geometryHash='0' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelectorAll('primitive')).toHaveLength(1);
    });

    for (let index = 1; index <= 10; index += 1) {
      view.rerender(
        <GltfMesh
          gltfFile={cameraFixtureGlb(index)}
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
    mocks.sectionView = { isActive: true };
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
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
      <GltfMesh gltfFile={cameraFixtureGlb(2)} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
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
    mocks.sectionView = { isActive: true };
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('topology failed'));
    vi.spyOn(GLTFLoader.prototype, 'parseAsync')
      .mockResolvedValueOnce(createGltf())
      .mockResolvedValueOnce(createGltf());
    const view = render(
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    const committedA = view.container.querySelector('primitive');

    view.rerender(
      <GltfMesh gltfFile={cameraFixtureGlb(2)} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
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
    mocks.sectionView = { isActive: true };
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
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(view.container.querySelector('primitive')).not.toBeNull();
    });
    view.rerender(
      <GltfMesh gltfFile={cameraFixtureGlb(2)} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(sectionTopology.registerGltfSectionSurfaceSources).toHaveBeenCalledTimes(2);
    });
    view.rerender(
      <GltfMesh gltfFile={cameraFixtureGlb(3)} geometryHash='c' presentationRevision={3} enableMatcap={false} />,
    );
    expect(parseAsync).toHaveBeenCalledTimes(2);
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

  it.each(['webgl', 'webgpu'] as const)(
    'should install section clipping on every demanded primitive before committing on %s',
    async (backend) => {
      const clip = presentOn(backend);
      const gltf = createClippableGltf();
      vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
      mocks.gl.compileAsync = vi.fn();
      const view = render(<GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='clip' enableMatcap={false} />);
      await waitFor(() => {
        expect(view.container.querySelector('primitive')).not.toBeNull();
      });
      expect(clipByKind(gltf.scene, clip)).toEqual(clippedKinds);
      expect(mocks.gl.compileAsync).not.toHaveBeenCalled();
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'should present the same geometry hash again with every material clipped at commit on %s',
    async (backend) => {
      const clip = presentOn(backend);
      // With Section on a result is never written in place, so each revision presents a fresh scene.
      mocks.sectionView = { isActive: true };
      vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
      const gltfs = [createClippableGltf(), createClippableGltf()];
      vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValueOnce(gltfs[0]!).mockResolvedValueOnce(gltfs[1]!);
      const atCommit = recordClipAtCommit(gltfs, clip);
      const view = render(
        <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='same' presentationRevision={1} enableMatcap={false} />,
      );
      await waitFor(() => {
        expect(atCommit.has(1)).toBe(true);
      });

      view.rerender(
        <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='same' presentationRevision={2} enableMatcap={false} />,
      );

      await waitFor(() => {
        expect(atCommit.get(2)).toEqual(clippedKinds);
      });
    },
  );

  it('should clip the first model before it commits when Section is already on', async () => {
    const clip = presentOn('webgl');
    mocks.sectionView = { isActive: true };
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
    const gltf = createClippableGltf();
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(gltf);
    const atCommit = recordClipAtCommit([gltf], clip);

    render(
      <GltfMesh gltfFile={cameraFixtureGlb(1)} geometryHash='restored' presentationRevision={1} enableMatcap={false} />,
    );

    await waitFor(() => {
      expect(atCommit.get(1)).toEqual(clippedKinds);
    });
  });
});
