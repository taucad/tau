import { StrictMode } from 'react';
import * as FeatureHooks from '#flags/use-feature.js';
import { act } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend, getRootState } from '@react-three/fiber';
import type { ReconcilerRoot, RootState } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor } from 'xstate';
import type { Actor, ActorRefFrom, EventFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { MeasurementAnchor, MeasurementRecord } from '#constants/measurement.types.js';
import type { measureExactOccurrenceDistance } from '#workers/measurement-exact.client.js';
import { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';
import type { Mechanism } from '@taucad/kinematics';
import { applyFatLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  MeasureTool,
  measurementCatalogGetterKey,
  readMeasurementCatalogObservation,
  describeMeasurementTarget,
  isWholePrimitiveMeasurementTarget,
} from '#components/geometry/graphics/three/react/measure-tool.js';
import type { MeasurementCatalogObservation } from '#components/geometry/graphics/three/react/measure-tool.js';
import {
  createGltfSurfaceBatches,
  gltfSurfacePresentationTag,
  qualifyGltfSurfaceMaterial,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import * as SectionViewHooks from '#components/geometry/graphics/three/use-section-view.js';
import { resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import * as measurementFeatures from '#components/geometry/graphics/three/utils/measurement-features.js';
import {
  findMeasurementTargets,
  getMeshMeasurementFeatures,
  listMeasurementTargets,
  measureTargetPair,
} from '#components/geometry/graphics/three/utils/measurement-features.js';
import { setModelComponentInstanceSlots } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import type {
  EdgeFeature,
  MeasurementTarget,
  MeshFeatureGraph,
} from '#components/geometry/graphics/three/utils/measurement-features.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import type { MeasurementFeatureWorkerClient } from '#components/geometry/graphics/three/utils/measurement-features-worker-client.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn<(event: EventFrom<typeof graphicsMachine>) => void>(),
  measureExact: vi.fn<typeof measureExactOccurrenceDistance>(),
  cad: undefined as ActorRefFrom<typeof cadMachine> | undefined,
  model: undefined as Actor<typeof modelInteractionMachine> | undefined,
  workerClientFactory: undefined as (() => MeasurementFeatureWorkerClient) | undefined,
  kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
  renderFrame: {
    anchorFrameId: 'tau:root',
    originMeters: [0, 0, 0] as [number, number, number],
    metersPerRenderUnit: 1,
  },
  graphicsSnapshot: {
    context: {
      gltfPresentation: { presentedKey: 'geometry' },
      geometryKey: 'geometry',
      pickableMeshesVersion: 0,
      measurements: [] as MeasurementRecord[],
      currentMeasurementStart: undefined as [number, number, number] | undefined,
      currentMeasurementAnchor: undefined as MeasurementAnchor | undefined,
      modelInteractionUnitId: undefined as string | undefined,
      measureSnapDistance: 12,
      measureMode: 'auto',
      measureFilter: 'auto',
      measureOperation: 'point-distance',
      measureFrame: 'tau:root',
      measureSnapEnabled: true,
      measureCandidates: [],
      measureActiveCandidateId: undefined as string | undefined,
      measureChosenCandidateId: undefined as string | undefined,
      measureLockedTargetId: undefined,
      measureCommitRequest: 0,
      measureCatalogRequest: 0,
      measureCatalogAppend: false,
      measureMessage: undefined as string | undefined,
      committedSectionCuts: [],
      displayUnits: { length: { metersPerUnit: 1, symbol: 'm' } },
      hoveredMeasurementId: undefined,
      isMeasureActive: true,
      cameraInteractionHadMovement: false,
    },
  },
}));

vi.mock('#components/geometry/graphics/three/utils/measurement-features-worker-client.js', async (importOriginal) => {
  const actual = await importOriginal<{ createMeasurementFeatureWorkerClient: () => MeasurementFeatureWorkerClient }>();
  return {
    ...actual,
    createMeasurementFeatureWorkerClient: () =>
      mocks.workerClientFactory?.() ?? actual.createMeasurementFeatureWorkerClient(),
  };
});

const graphicsActorMock = {
  send: mocks.send,
  getSnapshot: () => mocks.graphicsSnapshot,
  subscribe: () => ({ unsubscribe: vi.fn() }),
};

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => graphicsActorMock,
  useGraphicsSelector: <T,>(selector: (snapshot: typeof mocks.graphicsSnapshot) => T): T =>
    selector(mocks.graphicsSnapshot),
  useModelInteractionSelector: <T,>(selector: (snapshot: { context: ModelInteractionContext }) => T): T =>
    selector(
      mocks.model?.getSnapshot() ?? {
        context: { displayRevision: 0, revision: 0, unitsById: {}, unitOrder: [], lastInteractionSource: 'unknown' },
      },
    ),
  useRenderFrame: () => mocks.renderFrame,
  useKinematicsRef: () => mocks.kinematics,
}));

vi.mock('#hooks/use-cad.js', () => ({ useCad: () => mocks.cad }));
vi.mock('#workers/measurement-exact.client.js', () => ({ measureExactOccurrenceDistance: mocks.measureExact }));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
}));

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
  joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
};

function createStubWebGlRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = Object.create(THREE.WebGLRenderer.prototype) as THREE.WebGLRenderer;
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
  return renderer;
}

describe('MeasureTool', () => {
  let canvas: HTMLCanvasElement;
  let root: ReconcilerRoot<HTMLCanvasElement>;
  let mesh: THREE.Mesh;
  let secondaryMesh: THREE.Mesh | undefined;
  let camera: THREE.PerspectiveCamera;
  let getState: () => RootState;
  const renderTool = (): void => {
    const store = root.render(
      <>
        <primitive object={mesh} />
        {secondaryMesh ? <primitive object={secondaryMesh} /> : null}
        <MeasureTool />
      </>,
    );
    getState = store.getState;
  };

  /** A primary press over the centre of the viewport, where the box sits. */
  const pressCentre = (): void => {
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 400, clientY: 300 }));
    });
  };

  beforeAll(() => {
    extend(THREE as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(async () => {
    vi.spyOn(FeatureHooks, 'useFeature').mockReturnValue(true);
    mocks.workerClientFactory = undefined;
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
    mocks.send.mockReset();
    mocks.measureExact.mockReset();
    mocks.cad = undefined;
    mocks.model = undefined;
    mocks.graphicsSnapshot.context.currentMeasurementStart = undefined;
    mocks.graphicsSnapshot.context.currentMeasurementAnchor = undefined;
    mocks.graphicsSnapshot.context.modelInteractionUnitId = undefined;
    mocks.graphicsSnapshot.context.isMeasureActive = true;
    mocks.graphicsSnapshot.context.measureMode = 'auto';
    mocks.graphicsSnapshot.context.measureFilter = 'auto';
    mocks.graphicsSnapshot.context.measureOperation = 'point-distance';
    mocks.graphicsSnapshot.context.measureActiveCandidateId = undefined;
    mocks.graphicsSnapshot.context.measureChosenCandidateId = undefined;
    mocks.graphicsSnapshot.context.measureCommitRequest = 0;
    mocks.graphicsSnapshot.context.gltfPresentation.presentedKey = 'geometry';
    mocks.graphicsSnapshot.context.pickableMeshesVersion = 0;
    mocks.graphicsSnapshot.context.measureCatalogRequest = 0;
    mocks.graphicsSnapshot.context.measureCatalogAppend = false;
    mocks.graphicsSnapshot.context.measureMessage = undefined;
    mocks.graphicsSnapshot.context.measurements = [];
    canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
    document.body.append(canvas);
    camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    root = createRoot(canvas);
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    secondaryMesh = undefined;
    await act(async () => {
      await root.configure({
        camera,
        events: createPointerEvents,
        frameloop: 'never',
        gl: createStubWebGlRenderer(canvas),
        size: { height: 600, left: 0, top: 0, width: 800 },
      });
      renderTool();
    });
  });

  afterEach(() => {
    mocks.workerClientFactory = undefined;
    vi.useRealTimers();
    act(() => {
      root.unmount();
    });
    mocks.kinematics?.stop();
    mocks.model?.stop();
    canvas.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['translated', 'multipart', 'retired', 'same-count reorder'] as const)(
    'should guard the actual translated slot exact-request caller for %s evidence',
    async (scenario) => {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshBasicMaterial();
      const template = new THREE.Mesh(geometry, material);
      template.userData['measurementFeatures'] = { kind: 'surface', componentId: 'source' };
      getMeshMeasurementFeatures(template);
      const makeBatch = (ids: readonly string[]): THREE.InstancedMesh => {
        const batch = new THREE.InstancedMesh(geometry, material, ids.length);
        for (const [index] of ids.entries()) {
          batch.setMatrixAt(index, new THREE.Matrix4().makeTranslation(index * 4, 0, 0));
        }
        setModelComponentInstanceSlots(
          batch,
          ids.map((componentId) => ({
            owner: { unitId: 'u', componentId },
            sourceObject: template,
            measurementFeatures: { kind: 'surface', componentId },
          })),
        );
        batch.updateMatrixWorld(true);
        return batch;
      };
      const batch = makeBatch(['left', 'right']);
      mesh = batch;
      const capabilities = {
        canHide: true,
        canIsolate: true,
        canFocus: true,
        canAdjustOpacity: true,
        hasDrawings: false,
        hasPreciseTopology: true,
        exports: [],
      };
      const node = (id: string, name: string): GeometryComponentNode => ({
        id,
        name,
        kind: 'part',
        selector: id,
        childIds: [],
        depth: 0,
        path: [name],
        meshNodeIndices: [0],
        primitiveIndices: [0],
        materialIndices: [],
        capabilities,
      });
      const manifest: GeometryComponentManifest = {
        schemaVersion: 1,
        rootId: 'left',
        sourceFile: 'main.ts',
        geometryHash: 'geometry',
        nodeOrder: ['left', 'right'],
        nodesById: { left: node('left', 'Left'), right: node('right', 'Right') },
        capabilities,
      };
      mocks.model = createActor(modelInteractionMachine, { input: {} }).start();
      mocks.model.send({ type: 'loadManifest', unitId: 'u', manifest });
      mocks.cad = mock<ActorRefFrom<typeof cadMachine>>();
      mocks.graphicsSnapshot.context.modelInteractionUnitId = 'u';
      mocks.graphicsSnapshot.context.measureFilter = 'body';
      mocks.graphicsSnapshot.context.measureOperation = 'minimum-distance';
      mocks.measureExact.mockResolvedValue({
        status: 'cad-geometry',
        source: 'ap242',
        distanceMeters: 2,
        /* eslint-disable @typescript-eslint/naming-convention -- AP242 measurement wire witnesses use these exact public field names. */
        pointAMeters: [1, 0, 0],
        pointBMeters: [3, 0, 0],
        /* eslint-enable @typescript-eslint/naming-convention -- Restore naming checks after the exact external fields. */
      });
      mocks.send.mockImplementation((event) => {
        if (event.type === 'startMeasurement') {
          mocks.graphicsSnapshot.context.currentMeasurementStart = event.payload;
          mocks.graphicsSnapshot.context.currentMeasurementAnchor = event.anchor;
        } else if (event.type === 'cancelCurrentMeasurement') {
          mocks.graphicsSnapshot.context.currentMeasurementStart = undefined;
          mocks.graphicsSnapshot.context.currentMeasurementAnchor = undefined;
        }
      });
      if (scenario === 'multipart') {
        secondaryMesh = makeBatch(['right']);
      }
      const candidates = (): Array<{ id: string; label: string }> => {
        const event = mocks.send.mock.calls.findLast(
          ([event]) => event.type === 'setMeasureCandidates' && event.candidates.length > 0,
        )?.[0];
        return event?.type === 'setMeasureCandidates' ? event.candidates : [];
      };
      const choose = async (id: string): Promise<void> => {
        await act(async () => {
          mocks.graphicsSnapshot.context.measureActiveCandidateId = id;
          mocks.graphicsSnapshot.context.measureChosenCandidateId = id;
          mocks.graphicsSnapshot.context.measureCommitRequest++;
          renderTool();
        });
      };
      try {
        await act(async () => {
          mocks.graphicsSnapshot.context.measureCatalogRequest++;
          renderTool();
        });
        await vi.waitFor(() => {
          expect(candidates().some((candidate) => candidate.label.startsWith('Right:'))).toBe(true);
        });
        const left = candidates().find((candidate) => candidate.label.startsWith('Left:'));
        const right = candidates().find((candidate) => candidate.label.startsWith('Right:'));
        if (!left || !right) {
          throw new Error('Expected actual body catalog targets for both canonical slots');
        }
        await choose(left.id);
        await vi.waitFor(() => {
          expect(mocks.graphicsSnapshot.context.currentMeasurementStart).toBeDefined();
        });
        await act(async () => {
          renderTool();
        });
        if (scenario === 'retired') {
          batch.dispose();
        }
        if (scenario === 'same-count reorder') {
          batch.dispose();
          mesh = makeBatch(['right', 'left']);
          await act(async () => {
            renderTool();
          });
        }
        await choose(right.id);
        if (scenario === 'translated') {
          await vi.waitFor(() => {
            expect(mocks.measureExact).toHaveBeenCalledOnce();
          });
          expect(mocks.measureExact).toHaveBeenCalledWith(
            expect.objectContaining({
              manifest,
              occurrenceA: 'left',
              occurrenceB: 'right',
              presentedGeometryHash: 'geometry',
            }),
          );
          expect(mocks.graphicsSnapshot.context.currentMeasurementAnchor?.occurrenceId).toBeUndefined();
          await vi.waitFor(() => {
            expect(
              mocks.send.mock.calls.some(
                ([event]) => event.type === 'resolveMeasurementRecord' && event.patch.status === 'current',
              ),
            ).toBe(true);
          });
        } else {
          expect(mocks.measureExact).not.toHaveBeenCalled();
          expect(
            mocks.send.mock.calls.some(
              ([event]) => event.type === 'addMeasurementRecord' && event.record.status === 'unavailable',
            ),
          ).toBe(true);
        }
      } finally {
        batch.dispose();
        if (mesh instanceof THREE.InstancedMesh) {
          mesh.dispose();
        }
        if (secondaryMesh instanceof THREE.InstancedMesh) {
          secondaryMesh.dispose();
        }
        geometry.dispose();
        material.dispose();
      }
    },
  );

  it('cancels a pending selection when the model pose changes', () => {
    pressCentre();
    act(() => {
      mocks.kinematics!.send({ type: 'loadMechanism', unitId: 'file:main.ts', mechanism });
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'measurementPoseChanged' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'cancelCurrentMeasurement' });
  });

  it('should hide edge-on labels and their pointer targets until the arrow is readable again', async () => {
    mocks.graphicsSnapshot.context.measurements = [
      {
        id: 'distance',
        frameId: 'tau:root',
        startPoint: [-1, 0, 0],
        endPoint: [1, 0, 0],
        distance: 2,
        status: 'current',
      },
    ];
    await act(async () => {
      renderTool();
    });
    act(() => {
      getState().advance(0);
    });
    const label = getState().scene.getObjectByProperty('renderOrder', 2);
    if (!(label instanceof THREE.Group)) {
      throw new Error('Expected the current committed measurement label');
    }
    const [hitMesh] = label.children;
    if (!(hitMesh instanceof THREE.Mesh)) {
      throw new Error('Expected the actual committed label pointer target');
    }
    expect(label.visible).toBe(true);
    label.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1));
    const intersections: THREE.Intersection[] = [];
    hitMesh.raycast(raycaster, intersections);
    expect(intersections.length).toBeGreaterThan(0);

    camera.position.set(1.65, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    act(() => {
      getState().advance(1);
    });
    expect(label.visible).toBe(true);

    camera.position.set(1.8, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    act(() => {
      getState().advance(2);
    });
    expect(label.visible).toBe(false);
    label.updateMatrixWorld(true);
    intersections.length = 0;
    hitMesh.raycast(raycaster, intersections);
    expect(intersections).toHaveLength(0);

    camera.position.set(1.6, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    act(() => {
      getState().advance(3);
    });
    expect(label.visible).toBe(false);

    camera.position.set(1.5, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    act(() => {
      getState().advance(4);
    });
    expect(label.visible).toBe(true);
  });

  it('should refresh late line inventory and exclude retained pose sources through visibility toggles', async () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 2, 1, 0, 2, 0, 2, 2], 3));
    geometry.setIndex([0, 2]);
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
    line.userData['measurementFeatures'] = {
      occurrenceId: 'part',
      componentId: 'part',
      kind: 'line',
      edges: [{ id: 'edge', start: 0, count: 2 }],
    };
    line.visible = false;
    mesh.add(line);
    getMeshMeasurementFeatures(mesh);
    const graphs = vi.spyOn(measurementFeatures, 'getLineMeasurementFeatures');
    pressCentre();
    expect(graphs).not.toHaveBeenCalled();
    line.visible = true;
    applyFatLineSegments(
      { scene: mesh },
      { backend: 'webgl', resolution: new THREE.Vector2(800, 600), preserveSourceNodes: true },
    );
    const fatLine = line.children[0]!;
    try {
      await act(async () => {
        mocks.graphicsSnapshot.context.pickableMeshesVersion++;
        renderTool();
      });
      pressCentre();
      expect(graphs).toHaveBeenCalledWith(fatLine);
      expect(graphs.mock.calls.every(([source]) => source !== line)).toBe(true);
      const afterOn = graphs.mock.calls.length;
      line.visible = false;
      await act(async () => {
        mocks.graphicsSnapshot.context.pickableMeshesVersion++;
        renderTool();
      });
      pressCentre();
      expect(graphs.mock.calls.length).toBe(afterOn);
      line.visible = true;
      await act(async () => {
        mocks.graphicsSnapshot.context.pickableMeshesVersion++;
        renderTool();
      });
      pressCentre();
      expect(graphs.mock.calls.length).toBeGreaterThan(afterOn);
      expect(line.children[0]).toBe(fatLine);
      expect(graphs.mock.calls.every(([source]) => source !== line)).toBe(true);
    } finally {
      mesh.remove(line);
      geometry.dispose();
      line.material.dispose();
      (fatLine as THREE.Mesh).geometry.dispose();
      ((fatLine as THREE.Mesh).material as THREE.Material).dispose();
    }
  });

  it('names same-edge endpoints and distinct edges without exposing feature IDs', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.name = 'Frame';
    const graph = getMeshMeasurementFeatures(mesh);
    const edges = graph.features.filter(
      (feature): feature is EdgeFeature => feature.kind === 'edge' && !feature.closed,
    );
    expect(edges.length).toBeGreaterThan(1);
    const target = (feature: (typeof edges)[number], suffix: 'start' | 'end'): MeasurementTarget => ({
      id: `${mesh.uuid}:${graph.revision}:${feature.id}:endpoint:${suffix}`,
      featureId: feature.id,
      kind: 'endpoint',
      position: feature.points[0]!.clone(),
      localPosition: feature.points[0]!.clone(),
      evidence: feature.evidence,
      distancePx: 0,
      label: 'Edge endpoint',
      feature,
      sourceMesh: mesh,
      revision: graph.revision,
    });
    const start = describeMeasurementTarget(target(edges[0]!, 'start'), mesh);
    const end = describeMeasurementTarget(target(edges[0]!, 'end'), mesh);
    const nextEdge = describeMeasurementTarget(target(edges[1]!, 'start'), mesh);
    expect(start).toMatch(/^Frame: Edge endpoint \d+ · start$/);
    expect(end).toMatch(/^Frame: Edge endpoint \d+ · end$/);
    expect(new Set([start, end, nextEdge]).size).toBe(3);
    expect(start).not.toContain('edge:');
  });

  it('should expose a late keyboard target through bounded catalog pages', async () => {
    const first = measurementFeatures.listMeasurementTargets(getMeshMeasurementFeatures(mesh), {
      mesh,
      camera,
      canvas,
    })[0]!;
    vi.spyOn(measurementFeatures, 'listMeasurementTargets').mockReturnValue(
      Array.from({ length: 201 }, (_, index) => ({
        ...first,
        id: `late:${index}`,
        kind: 'endpoint',
        position: new THREE.Vector3(0, 0, 1),
        sourceMesh: mesh,
      })),
    );
    act(() => {
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    const published = () => {
      const event = mocks.send.mock.calls.findLast(
        ([sent]) => sent.type === 'setMeasureCandidates' && sent.candidates.length > 0,
      )?.[0];
      return event?.type === 'setMeasureCandidates'
        ? { candidates: event.candidates, hasMore: event.hasMore }
        : undefined;
    };
    await vi.waitFor(() => {
      expect(published()?.candidates).toHaveLength(100);
    });
    expect(published()).toMatchObject({ hasMore: true });
    act(() => {
      mocks.graphicsSnapshot.context.measureCatalogAppend = true;
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    await vi.waitFor(() => {
      expect(published()?.candidates).toHaveLength(200);
    });
    act(() => {
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    await vi.waitFor(() => {
      expect(published()?.candidates).toHaveLength(201);
    });
    expect(published()?.candidates.at(-1)?.id).toBe(`${mesh.uuid}:late:200`);
    expect(published()?.hasMore).toBe(false);
  });

  it('continues at the first feature of a smaller next mesh after the worker resolves', async () => {
    const firstGraph = getMeshMeasurementFeatures(mesh);
    firstGraph.features = Array.from({ length: 300 }, (_, index) => ({
      ...firstGraph.features[0]!,
      id: `synthetic:${index}`,
    }));
    secondaryMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    secondaryMesh.position.x = 3;
    const secondGraph = getMeshMeasurementFeatures(secondaryMesh);
    const seed = measurementFeatures.listMeasurementTargets(secondGraph, {
      mesh: secondaryMesh,
      camera,
      canvas,
    })[0]!;
    vi.spyOn(measurementFeatures, 'listMeasurementTargets').mockImplementation((graph, options) =>
      graph.features.length === 0
        ? []
        : [
            {
              ...seed,
              id: `from:${options.mesh === secondaryMesh ? 'second' : 'first'}:${graph.features[0]!.id}`,
              sourceMesh: options.mesh,
              feature: graph.features[0]!,
              featureId: graph.features[0]!.id,
              position: options.mesh === secondaryMesh ? new THREE.Vector3(3, 0, 1) : new THREE.Vector3(0, 0, 1),
            },
          ],
    );
    act(() => {
      renderTool();
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    await vi.waitFor(() => {
      const published = mocks.send.mock.calls.findLast(
        ([sent]) => sent.type === 'setMeasureCandidates' && sent.candidates.length > 0,
      )?.[0];
      expect(
        published?.type === 'setMeasureCandidates' && published.candidates.some(({ id }) => id.includes('from:second')),
      ).toBe(true);
    });
  });

  it.each(['presentation', 'unknown', 'revoked', 'hidden', 'clipped'] as const)(
    'should retain canonical body catalog authority with %s surface evidence',
    async (scenario) => {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshStandardMaterial();
      qualifyGltfSurfaceMaterial(material);
      const template = new THREE.Mesh(geometry, material);
      const graph = getMeshMeasurementFeatures(template);
      const source = new THREE.InstancedMesh(geometry, material, 1);
      source.setMatrixAt(0, new THREE.Matrix4());
      source.position.x = 2;
      if (scenario !== 'unknown') {
        setModelComponentInstanceSlots(source, [
          { owner: { unitId: 'u', componentId: 'placed' }, sourceObject: template },
        ]);
      }
      const peer = new THREE.InstancedMesh(geometry, material, 1);
      peer.setMatrixAt(0, new THREE.Matrix4());
      peer.position.x = -2;
      setModelComponentInstanceSlots(peer, [{ owner: { unitId: 'u', componentId: 'peer' }, sourceObject: template }]);
      mesh = source;
      secondaryMesh = peer;
      await act(async () => {
        renderTool();
      });
      const state = getRootState(source);
      if (!state) {
        throw new Error('Expected the actual mounted canonical scene.');
      }
      // Actual ordinary source meshes create the private presentation; the canonical instances remain independent witnesses.
      const presentationSources = [2, -2].map((x) => {
        const ordinary = new THREE.Mesh(geometry, material);
        ordinary.position.x = x;
        return ordinary;
      });
      const batches =
        scenario === 'presentation' ? createGltfSurfaceBatches(state.scene, presentationSources) : undefined;
      try {
        batches?.sync();
        if (batches) {
          expect(batches.group.parent).toBe(state.scene);
          expect(batches.group.userData[gltfSurfacePresentationTag]).toBe(true);
          expect(batches.group.children).toHaveLength(1);
          const presentation = batches.group.children[0];
          if (!(presentation instanceof THREE.InstancedMesh)) {
            throw new Error('Expected the actual generated surface batch.');
          }
          expect(presentation.count).toBe(2);
          expect(presentation.visible).toBe(true);
          expect(source.layers.mask).toBe(1);
          expect(peer.layers.mask).toBe(1);
          expect(presentationSources.map((ordinary) => ordinary.layers.mask)).toEqual([0, 0]);
        }
        switch (scenario) {
          case 'revoked': {
            source.dispose();
            break;
          }
          case 'hidden': {
            source.visible = false;
            peer.visible = false;
            break;
          }
          case 'clipped': {
            vi.spyOn(SectionViewHooks, 'resolveSectionViewRaycastClip').mockReturnValue({
              enabled: true,
              pieces: resolveSectionPieces([{ id: 'all', kind: 'plane', plane: 'xy', offset: -2, isFlipped: false }]),
            });
            break;
          }
          default: {
            break;
          }
        }
        await act(async () => {
          mocks.graphicsSnapshot.context.measureFilter = 'body';
          mocks.graphicsSnapshot.context.measureOperation = 'minimum-distance';
          mocks.graphicsSnapshot.context.pickableMeshesVersion++;
          mocks.graphicsSnapshot.context.measureCatalogRequest++;
          renderTool();
        });
        await vi.waitFor(() => {
          expect(readMeasurementCatalogObservation(state.scene)?.terminalBranch).toBe(
            scenario === 'unknown' || scenario === 'revoked' ? 'missing-canonical-source' : 'published',
          );
        });
        if (scenario !== 'presentation') {
          expect(
            mocks.send.mock.calls.filter(
              ([event]) => event.type === 'setMeasureCandidates' && event.candidates.length > 0,
            ),
          ).toEqual([]);
          expect(readMeasurementCatalogObservation(state.scene)?.catalogSize).toBe(
            scenario === 'unknown' || scenario === 'revoked' ? 1 : 0,
          );
          expect(mocks.send.mock.calls.some(([event]) => event.type === 'startMeasurement')).toBe(false);
          return;
        }
        const published = mocks.send.mock.calls.findLast(([event]) => event.type === 'setMeasureCandidates')?.[0];
        if (published?.type !== 'setMeasureCandidates') {
          throw new Error('Expected the actual catalog candidate event.');
        }
        const target = listMeasurementTargets(graph, {
          mesh: source,
          instanceId: 0,
          camera,
          canvas,
          filter: 'body',
        }).find((candidate) => candidate.kind === 'body');
        const peerTarget = listMeasurementTargets(graph, {
          mesh: peer,
          instanceId: 0,
          camera,
          canvas,
          filter: 'body',
        }).find((candidate) => candidate.kind === 'body');
        if (!target || !peerTarget) {
          throw new Error('Expected both genuine canonical body targets.');
        }
        expect(target.occurrenceId).toBe('placed');
        expect(target.position.toArray()).toEqual([2, 0, 0]);
        expect(published.candidates.map(({ id }) => id).sort()).toEqual(
          [`${source.uuid}:${target.id}`, `${peer.uuid}:${peerTarget.id}`].sort(),
        );
        expect(readMeasurementCatalogObservation(state.scene)).toMatchObject({ catalogSize: 2, sourceResolved: true });
        await act(async () => {
          mocks.graphicsSnapshot.context.measureActiveCandidateId = `${source.uuid}:${target.id}`;
          mocks.graphicsSnapshot.context.measureChosenCandidateId = `${source.uuid}:${target.id}`;
          mocks.graphicsSnapshot.context.measureCommitRequest++;
          renderTool();
        });
        await vi.waitFor(() => {
          const started = mocks.send.mock.calls.findLast(([event]) => event.type === 'startMeasurement')?.[0];
          expect(started).toMatchObject({
            type: 'startMeasurement',
            payload: [2, 0, 0],
            anchor: { geometryKey: 'geometry', occurrenceId: 'placed', featureKind: 'body' },
          });
        });
        expect(batches?.group.parent).toBe(state.scene);
        expect(batches?.group.children).toHaveLength(1);
      } finally {
        batches?.dispose();
        source.dispose();
        peer.dispose();
        geometry.dispose();
        material.dispose();
      }
    },
  );

  it('should publish a held cold body catalog after activation and its unchanged first actual frame', async () => {
    const actualGraph = getMeshMeasurementFeatures(mesh);
    const pending = Promise.withResolvers<MeshFeatureGraph | undefined>();
    const prepared = vi.fn<MeasurementFeatureWorkerClient['prepare']>(async () => pending.promise);
    mocks.workerClientFactory = () => ({ ready: getMeshMeasurementFeatures, prepare: prepared, dispose: vi.fn() });
    vi.spyOn(measurementFeatures, 'getCachedMeshMeasurementFeatures').mockReturnValue(undefined);
    await act(async () => {
      mocks.graphicsSnapshot.context.isMeasureActive = false;
      renderTool();
    });
    const state = getRootState(mesh);
    if (!state) {
      throw new Error('Expected the actual mounted measurement root.');
    }
    const inactiveCameraMatrixWorld = [...camera.matrixWorld.elements];
    await act(async () => {
      camera.position.x = 1;
      camera.updateMatrixWorld();
      state.advance(0);
    });
    await act(async () => {
      mocks.graphicsSnapshot.context.isMeasureActive = true;
      mocks.graphicsSnapshot.context.measureFilter = 'body';
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    await vi.waitFor(() => {
      expect(prepared).toHaveBeenCalledOnce();
    });
    const captured = readMeasurementCatalogObservation(state.scene);
    expect(captured).toMatchObject({
      requestId: 1,
      prepareResult: 'pending',
      captured: { candidateSource: { isMeasureActive: true, measureFilter: 'body', cameraRevision: 0 } },
    });
    expect(captured?.captured.cameraMatrixWorld).not.toEqual(inactiveCameraMatrixWorld);
    expect(captured?.captured.cameraMatrixWorld).toEqual(camera.matrixWorld.elements);
    await act(async () => {
      state.advance(1);
    });
    expect(camera.matrixWorld.elements).toEqual(captured?.captured.cameraMatrixWorld);
    expect(camera.projectionMatrix.elements).toEqual(captured?.captured.cameraProjectionMatrix);
    await act(async () => {
      pending.resolve(actualGraph);
    });
    await vi.waitFor(() => {
      expect(readMeasurementCatalogObservation(state.scene)).toMatchObject({
        requestId: 1,
        prepareResult: 'ready',
        terminalBranch: 'published',
        graphBodyCount: 1,
      });
    });
    const observation = readMeasurementCatalogObservation(state.scene);
    expect(observation?.observed).toEqual(observation?.captured);
    expect(observation?.catalogSize).toBeGreaterThan(0);
    expect(
      mocks.send.mock.calls.some(([event]) => event.type === 'setMeasureCandidates' && event.candidates.length > 0),
    ).toBe(true);
    expect(prepared).toHaveBeenCalledOnce();
  });

  it('should expose the actual cold graph result and revoke the mounted catalog getter', async () => {
    const actualGraph = getMeshMeasurementFeatures(mesh);
    const prepared = vi.fn<MeasurementFeatureWorkerClient['prepare']>();
    let release: ((graph: MeshFeatureGraph | undefined) => void) | undefined;
    prepared.mockImplementation(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    mocks.workerClientFactory = () => ({ ready: getMeshMeasurementFeatures, prepare: prepared, dispose: vi.fn() });
    vi.spyOn(measurementFeatures, 'getCachedMeshMeasurementFeatures').mockReturnValue(undefined);
    await act(async () => {
      mocks.graphicsSnapshot.context.measureFilter = 'body';
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    await vi.waitFor(() => {
      expect(prepared).toHaveBeenCalledOnce();
    });
    const scene = getRootState(mesh)?.scene;
    if (!scene) {
      throw new Error('Expected the actual mounted scene.');
    }
    expect(readMeasurementCatalogObservation(scene)).toMatchObject({ requestId: 1, prepareResult: 'pending' });
    if (!release) {
      throw new Error('Expected the actual pending feature preparation.');
    }
    const complete = release;
    await act(async () => {
      complete(actualGraph);
    });
    await vi.waitFor(() => {
      expect(readMeasurementCatalogObservation(scene)).toMatchObject({
        requestId: 1,
        prepareResult: 'ready',
        terminalBranch: 'published',
        sourceResolved: true,
        worldMatrixAvailable: true,
        graphBodyCount: 1,
      });
    });
    const observation = readMeasurementCatalogObservation(scene);
    expect(observation?.catalogSize).toBeGreaterThan(0);
    const published = mocks.send.mock.calls.findLast(
      ([event]) => event.type === 'setMeasureCandidates' && event.candidates.length > 0,
    )?.[0];
    if (published?.type !== 'setMeasureCandidates') {
      throw new Error('Expected actual published body candidates.');
    }
    expect(published.candidates.length).toBeGreaterThan(0);
    expect(typeof published.candidates.at(0)?.label).toBe('string');
    if (!observation) {
      throw new Error('Expected a prepared catalog snapshot.');
    }
    expect(observation.observed).toEqual(observation.captured);
    expect(readMeasurementCatalogObservation(scene)).not.toBe(observation);
    expect(readMeasurementCatalogObservation(scene)?.captured.cameraMatrixWorld).not.toBe(
      observation.captured.cameraMatrixWorld,
    );
    const getter = scene.userData[measurementCatalogGetterKey] as () => MeasurementCatalogObservation | undefined;
    await act(async () => {
      root.render(
        <>
          <primitive object={mesh} />
          <MeasureTool key='original' />
          <MeasureTool key='replacement' />
        </>,
      );
    });
    const replacementGetter = scene.userData[measurementCatalogGetterKey] as () =>
      | MeasurementCatalogObservation
      | undefined;
    expect(replacementGetter).not.toBe(getter);
    expect(getter()).toBeUndefined();
    await act(async () => {
      root.render(
        <>
          <primitive object={mesh} />
          <MeasureTool key='replacement' />
        </>,
      );
    });
    expect(scene.userData[measurementCatalogGetterKey]).toBe(replacementGetter);
    vi.mocked(FeatureHooks.useFeature).mockReturnValue(false);
    await act(async () => {
      root.render(
        <>
          <primitive object={mesh} />
          <MeasureTool key='replacement' />
        </>,
      );
    });
    expect(scene.userData[measurementCatalogGetterKey]).toBeUndefined();
    expect(replacementGetter()).toBeUndefined();
    await act(async () => {
      root.unmount();
    });
    expect(readMeasurementCatalogObservation(scene)).toBeUndefined();
  });

  it.each(['camera', 'camera-frame', 'geometry', 'filter', 'mode'] as const)(
    'should cancel a pending catalog when %s changes',
    async (change) => {
      const actualGraph = getMeshMeasurementFeatures(mesh);
      const pending = Promise.withResolvers<MeshFeatureGraph | undefined>();
      const prepared = vi.fn<MeasurementFeatureWorkerClient['prepare']>(async () => pending.promise);
      mocks.workerClientFactory = () => ({ ready: getMeshMeasurementFeatures, prepare: prepared, dispose: vi.fn() });
      vi.spyOn(measurementFeatures, 'getCachedMeshMeasurementFeatures').mockReturnValue(undefined);
      await act(async () => {
        mocks.graphicsSnapshot.context.measureCatalogRequest++;
        renderTool();
      });
      await vi.waitFor(() => {
        expect(prepared).toHaveBeenCalledOnce();
      });
      const state = getRootState(mesh);
      if (!state) {
        throw new Error('Expected the actual mounted scene.');
      }
      const { scene } = state;
      if (change === 'camera-frame') {
        await act(async () => {
          state.advance(0);
        });
      }
      const captured = readMeasurementCatalogObservation(scene);
      expect(captured).toMatchObject({ requestId: 1, prepareResult: 'pending' });
      await act(async () => {
        switch (change) {
          case 'camera':
          case 'camera-frame': {
            camera.position.x = 1;
            camera.updateMatrixWorld();
            break;
          }
          case 'geometry': {
            mocks.graphicsSnapshot.context.gltfPresentation.presentedKey = 'replacement';
            break;
          }
          case 'filter': {
            mocks.graphicsSnapshot.context.measureFilter = 'body';
            break;
          }
          case 'mode': {
            mocks.graphicsSnapshot.context.measureMode = 'point';
            break;
          }
        }
        if (change === 'camera-frame') {
          state.advance(1);
        } else {
          renderTool();
        }
      });
      await act(async () => {
        pending.resolve(actualGraph);
      });
      await vi.waitFor(() => {
        expect(readMeasurementCatalogObservation(scene)?.terminalBranch).toBe(
          change === 'camera' ? 'camera-changed' : change === 'camera-frame' ? 'version-changed' : 'effect-cleanup',
        );
      });
      expect(
        mocks.send.mock.calls.some(([event]) => event.type === 'setMeasureCandidates' && event.candidates.length > 0),
      ).toBe(false);
      const observation = readMeasurementCatalogObservation(scene);
      expect(observation).toMatchObject({ requestId: 1, catalogSize: 0 });
      if (!observation) {
        throw new Error('Expected the actual cancelled catalog owner.');
      }
      expect(observation.captured).toEqual(captured?.captured);
      if (change === 'camera' || change === 'camera-frame') {
        expect(observation.observed.cameraMatrixWorld).not.toEqual(observation.captured.cameraMatrixWorld);
        if (change === 'camera-frame') {
          expect(observation.captured.candidateSource?.cameraRevision).toBe(0);
          expect(observation.observed.candidateSource?.cameraRevision).toBe(1);
        }
      } else if (change === 'geometry') {
        expect(observation.observed.sourceCurrent).toBe(false);
      } else {
        expect(mocks.graphicsSnapshot.context[change === 'filter' ? 'measureFilter' : 'measureMode']).not.toBe(
          observation.captured.candidateSource?.[change === 'filter' ? 'measureFilter' : 'measureMode'],
        );
      }
    },
  );

  it('clears a preparing catalog status when geometry replacement invalidates its worker request', async () => {
    act(() => {
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    await vi.waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith({
        type: 'setMeasureMessage',
        message: 'Preparing measurement features…',
      });
    });
    mocks.graphicsSnapshot.context.measureMessage = 'Preparing measurement features…';
    act(() => {
      mocks.graphicsSnapshot.context.gltfPresentation.presentedKey = 'replacement';
      renderTool();
    });
    await vi.waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith({ type: 'setMeasureMessage' });
    });
  });

  it('reports a cold pointer worker failure without synchronously building the graph', async () => {
    vi.stubGlobal('Worker', function unavailableWorker() {
      throw new Error('Worker unavailable');
    });
    pressCentre();
    await vi.waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith({
        type: 'setMeasureMessage',
        message: 'Measurement features could not be prepared. Move the pointer to retry.',
      });
    });
    expect(measurementFeatures.getCachedMeshMeasurementFeatures(mesh)).toBeUndefined();
  });

  it('prepares a cold mesh after StrictMode replays effect cleanup', () => {
    let livePrepares = 0;
    mocks.workerClientFactory = () => {
      let disposed = false;
      return {
        ready: () => undefined,
        prepare: async () => {
          if (!disposed) {
            livePrepares++;
          }
          return undefined;
        },
        dispose: () => {
          disposed = true;
        },
      };
    };
    act(() => {
      root.render(
        <StrictMode>
          <primitive object={mesh} />
          <MeasureTool />
        </StrictMode>,
      );
    });
    pressCentre();
    expect(livePrepares).toBeGreaterThan(0);
  });

  it('ignores a rejected pointer request after pickable meshes change', async () => {
    const rejectRequests: Array<(reason: Error) => void> = [];
    const dispose = vi.fn();
    mocks.workerClientFactory = () => ({
      ready: () => undefined,
      prepare: async () =>
        new Promise<ReturnType<MeasurementFeatureWorkerClient['ready']>>((_resolve, reject) => {
          rejectRequests.push(reject);
        }),
      dispose,
    });
    pressCentre();
    const rejectOldRequest = rejectRequests[0];
    expect(rejectOldRequest).toBeDefined();
    await act(async () => {
      mocks.graphicsSnapshot.context.pickableMeshesVersion++;
      renderTool();
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalled();
    await act(async () => {
      rejectOldRequest!(new Error('Old source failed'));
      await Promise.resolve();
    });
    expect(mocks.send).not.toHaveBeenCalledWith({
      type: 'setMeasureMessage',
      message: 'Measurement features could not be prepared. Move the pointer to retry.',
    });
  });
});

describe('actual instance measurement feature oracle', () => {
  it('should qualify a translated complete canonical slot for exact whole-part measurement and deny multipart or retired evidence', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    const template = new THREE.Mesh(geometry, material);
    const scene = new THREE.Group();
    const batch = new THREE.InstancedMesh(geometry, material, 2);
    batch.setMatrixAt(0, new THREE.Matrix4());
    batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0));
    const metadata = { kind: 'surface', componentId: 'source' };
    template.userData['measurementFeatures'] = metadata;
    setModelComponentInstanceSlots(batch, [
      { owner: { unitId: 'u', componentId: 'left' }, sourceObject: template, measurementFeatures: metadata },
      { owner: { unitId: 'u', componentId: 'right' }, sourceObject: template, measurementFeatures: metadata },
    ]);
    scene.add(batch);
    scene.updateMatrixWorld(true);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.z = 20;
    camera.updateMatrixWorld(true);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const graph = getMeshMeasurementFeatures(template);
    const target = listMeasurementTargets(graph, { mesh: batch, instanceId: 1, camera, canvas, filter: 'body' }).find(
      (candidate) => candidate.kind === 'body',
    );
    if (!target) {
      throw new Error('Expected actual translated complete-body target');
    }
    const second = new THREE.InstancedMesh(geometry, material, 1);
    second.setMatrixAt(0, new THREE.Matrix4().makeTranslation(4, 0, 0));
    setModelComponentInstanceSlots(second, [
      { owner: { unitId: 'u', componentId: 'right' }, sourceObject: template, measurementFeatures: metadata },
    ]);
    try {
      expect(target.position.x).toBe(4);
      expect(target.occurrenceId).toBe('right');
      expect(isWholePrimitiveMeasurementTarget({ scene, componentId: 'right', target, mesh: batch })).toBe(true);
      scene.add(second);
      scene.updateMatrixWorld(true);
      expect(isWholePrimitiveMeasurementTarget({ scene, componentId: 'right', target, mesh: batch })).toBe(false);
      scene.remove(second);
      expect(isWholePrimitiveMeasurementTarget({ scene, componentId: 'right', target, mesh: batch })).toBe(true);
      batch.dispose();
      expect(isWholePrimitiveMeasurementTarget({ scene, componentId: 'right', target, mesh: batch })).toBe(false);
    } finally {
      batch.dispose();
      second.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
  it('should retain the real batch and canonical slot identity through full body supports and measured distance', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    const template = new THREE.Mesh(geometry, material);
    const batch = new THREE.InstancedMesh(geometry, material, 2);
    batch.setMatrixAt(0, new THREE.Matrix4());
    batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0));
    setModelComponentInstanceSlots(batch, [
      { owner: { unitId: 'u', componentId: 'left' }, sourceObject: template },
      { owner: { unitId: 'u', componentId: 'right' }, sourceObject: template },
    ]);
    batch.updateMatrixWorld(true);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.z = 20;
    camera.updateMatrixWorld(true);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    try {
      const graph = getMeshMeasurementFeatures(template);
      const targets = [0, 1].map((instanceId) =>
        listMeasurementTargets(graph, { mesh: batch, instanceId, camera, canvas, filter: 'body' }).find(
          (target) => target.kind === 'body',
        ),
      );
      const [left, right] = targets;
      if (!left || !right) {
        throw new Error('Expected full placed body feature targets');
      }
      expect(left.sourceMesh).toBe(batch);
      expect(right.sourceMesh).toBe(batch);
      expect(left.occurrenceId).toBe('left');
      expect(right.occurrenceId).toBe('right');
      expect(left.id).not.toBe(right.id);
      expect(right.position.x - left.position.x).toBeCloseTo(4);
      const ordinary = new THREE.Mesh(geometry, material);
      ordinary.position.x = 4;
      ordinary.updateMatrixWorld(true);
      const ordinaryTarget = listMeasurementTargets(graph, { mesh: ordinary, camera, canvas, filter: 'body' }).find(
        (target) => target.kind === 'body',
      );
      expect(right.position.toArray()).toEqual(ordinaryTarget?.position.toArray());
      const distance = measureTargetPair(left, right);
      expect(distance.some((result) => result.value === 4)).toBe(true);
      // The keyboard face catalog exposes centroids. A bounded face target is produced
      // from the actual canonical triangle hit, exactly as pointer measurement does.
      const facingTarget = (instanceId: number, sourceX: number): MeasurementTarget | undefined => {
        const face = graph.features.find(
          (feature) => feature.kind === 'face' && Math.abs(feature.centroid.x - sourceX) < 1e-6,
        );
        if (face?.kind !== 'face') {
          return undefined;
        }
        const surfaceHit = face.centroid.clone().add(new THREE.Vector3(instanceId * 4, 0, 0));
        return findMeasurementTargets(graph, {
          mesh: batch,
          instanceId,
          camera,
          canvas,
          mousePos: new THREE.Vector2(),
          snapDistancePx: Number.MAX_VALUE,
          maxResults: Number.MAX_VALUE,
          filter: 'face',
          surfaceHit,
          faceIndex: face.triangleIndices[0],
        }).find((target) => target.kind === 'face');
      };
      const leftFace = facingTarget(0, 1);
      const rightFace = facingTarget(1, -1);
      if (!leftFace || !rightFace) {
        throw new Error('Expected canonical facing box surfaces');
      }
      expect(leftFace.position.x).toBe(1);
      expect(rightFace.position.x).toBe(3);
      const full = measureTargetPair(leftFace, rightFace).find((result) => result.operation === 'minimum-distance');
      const coarse = geometry.clone();
      coarse.setIndex([0, 1, 2]);
      try {
        batch.geometry = coarse;
        const retained = measureTargetPair(leftFace, rightFace).find(
          (result) => result.operation === 'minimum-distance',
        );
        expect(full?.value).toBeCloseTo(2);
        expect(retained?.value).toBeCloseTo(full!.value);
      } finally {
        batch.geometry = geometry;
        coarse.dispose();
      }
      expect(() => {
        setModelComponentInstanceSlots(batch, [
          { owner: { unitId: 'u', componentId: 'right' }, sourceObject: template },
          { owner: { unitId: 'u', componentId: 'left' }, sourceObject: template },
        ]);
      }).toThrow('already bound');
      expect(measureTargetPair(left, right).some((result) => result.value === 4)).toBe(true);
      batch.dispose();
      expect(measureTargetPair(left, right)).toEqual([]);
      expect(listMeasurementTargets(graph, { mesh: batch, instanceId: 1, camera, canvas, filter: 'body' })).toEqual([]);
    } finally {
      batch.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
});
