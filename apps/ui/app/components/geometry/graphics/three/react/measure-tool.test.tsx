import { StrictMode } from 'react';
import { act } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type { ReconcilerRoot, RootState } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { Mechanism } from '@taucad/kinematics';
import type { MeasurementRecord } from '#constants/measurement.types.js';
import { applyFatLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { MeasureTool, describeMeasurementTarget } from '#components/geometry/graphics/three/react/measure-tool.js';
import * as measurementFeatures from '#components/geometry/graphics/three/utils/measurement-features.js';
import { getMeshMeasurementFeatures } from '#components/geometry/graphics/three/utils/measurement-features.js';
import type { EdgeFeature, MeasurementTarget } from '#components/geometry/graphics/three/utils/measurement-features.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import type { MeasurementFeatureWorkerClient } from '#components/geometry/graphics/three/utils/measurement-features-worker-client.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn<
    (event: { type: string; candidates?: Array<{ id: string; label: string }>; hasMore?: boolean }) => void
  >(),
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
      currentMeasurementStart: undefined,
      measureSnapDistance: 12,
      measureMode: 'auto',
      measureFilter: 'auto',
      measureOperation: 'point-distance',
      measureFrame: 'tau:root',
      measureSnapEnabled: true,
      measureCandidates: [],
      measureActiveCandidateId: undefined,
      measureChosenCandidateId: undefined,
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
  useModelInteractionSelector: <T,>(selector: (snapshot: { context: { displayRevision: number } }) => T): T =>
    selector({ context: { displayRevision: 0 } }),
  useRenderFrame: () => mocks.renderFrame,
  useKinematicsRef: () => mocks.kinematics,
}));

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
    mocks.workerClientFactory = undefined;
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
    mocks.send.mockClear();
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
    canvas.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('cancels a pending selection when the model pose changes', () => {
    pressCentre();
    act(() => {
      mocks.kinematics!.send({ type: 'loadMechanism', unitId: 'file:main.ts', mechanism });
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'measurementPoseChanged' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'cancelCurrentMeasurement' });
  });

  it('should hide edge-on labels and their pointer targets until the arrow is readable again', () => {
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
    act(() => {
      renderTool();
      getState().advance(0);
    });
    const label = getState().scene.getObjectByProperty('renderOrder', 2) as THREE.Group;
    const hitMesh = label.children[0] as THREE.Mesh;
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
        ([sent]) => sent.type === 'setMeasureCandidates' && (sent.candidates?.length ?? 0) > 0,
      )?.[0];
      return event && { candidates: event.candidates, hasMore: event.hasMore };
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
    expect(published()?.candidates?.at(-1)?.id).toBe(`${mesh.uuid}:late:200`);
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
        ([sent]) => sent.type === 'setMeasureCandidates' && (sent.candidates?.length ?? 0) > 0,
      )?.[0];
      expect(published?.candidates?.some(({ id }) => id.includes('from:second'))).toBe(true);
    });
  });

  it.each(['camera', 'geometry'] as const)('should cancel a pending catalog when %s changes', async (change) => {
    act(() => {
      mocks.graphicsSnapshot.context.measureCatalogRequest++;
      renderTool();
    });
    act(() => {
      if (change === 'camera') {
        camera.position.x = 1;
        camera.updateMatrixWorld();
      } else {
        mocks.graphicsSnapshot.context.gltfPresentation.presentedKey = 'replacement';
      }
      renderTool();
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(
      mocks.send.mock.calls.some(
        ([event]) => event.type === 'setMeasureCandidates' && (event.candidates?.length ?? 0) > 0,
      ),
    ).toBe(false);
  });

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
