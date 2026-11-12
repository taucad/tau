import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { clearRendererSpans, onViewerEvent, rendererSpans } from '#lib/renderer-telemetry.js';
import type { ViewerTelemetryEvent } from '#lib/viewer-events.js';
import type { GeometryComponentBounds, GeometryComponentManifest } from '@taucad/types';
import type { Mechanism } from '@taucad/kinematics';
import type { GltfPresentationTelemetry, GraphicsEvent } from '#machines/graphics.machine.js';
import { graphicsMachine, selectComponentFocus } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type {
  PresentationHostCommand,
  PresentationHostLogic,
  PresentationRequest,
} from '#machines/presentation.machine.js';
import { applyCanonicalGltfBounds } from '#graphics/three/gltf-world.js';

const createGraphicsActor = () =>
  createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) },
    }),
    { input: {} },
  );

const artifact = (): { mimeType: 'model/gltf-binary'; content: Uint8Array<ArrayBuffer> } => ({
  mimeType: 'model/gltf-binary',
  content: new TextEncoder().encode('{}'),
});

const telemetry = (revision: number): GltfPresentationTelemetry => ({
  revision,
  key: `geometry-${revision}`,
  backend: 'webgl',
  barrier: 'display-ready',
  outcome: 'presented',
  glbBytes: 2,
  meshCount: 0,
  triangleCount: 0,
  sourceLineCount: 0,
  lineSegmentCount: 0,
  durations: {},
  modelEmptyFrames: 0,
  committedBundleHighWaterMark: 1,
  candidateBundleHighWaterMark: 1,
  topologyJobsStarted: 0,
  topologyJobsDiscarded: 0,
});

const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  rootId: 'root',
  nodeOrder: ['root'],
  nodesById: {
    root: {
      id: 'root',
      selector: 'root',
      name: 'Model',
      kind: 'model',
      depth: 0,
      childIds: [],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      path: ['Model'],
      capabilities: {
        canAdjustOpacity: false,
        canFocus: false,
        canHide: false,
        canIsolate: false,
        exports: [],
        hasDrawings: false,
        hasPreciseTopology: false,
      },
    },
  },
  capabilities: {
    canAdjustOpacity: false,
    canFocus: false,
    canHide: false,
    canIsolate: false,
    exports: [],
    hasDrawings: false,
    hasPreciseTopology: false,
  },
};

describe('graphics GLTF presentation projection', () => {
  it('separates requested and presented identities and rejects a stale commit', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({
        type: 'updateArtifact',
        artifact: artifact(),
        hash: 'a',
      });
      actor.send({
        type: 'gltfPresentationCommitted',
        revision: 1,
        key: 'a',
        unitId: 'unit:a',
        manifest,
      });
      actor.send({
        type: 'updateArtifact',
        artifact: artifact(),
        hash: 'b',
      });

      expect(actor.getSnapshot().context.gltfPresentation).toMatchObject({
        requestedRevision: 2,
        requestedKey: 'b',
        presentedRevision: 1,
        presentedKey: 'a',
        phase: 'preparing',
      });

      actor.send({
        type: 'gltfPresentationCommitted',
        revision: 1,
        key: 'a',
        unitId: 'unit:stale',
        manifest,
      });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:a');
      expect(actor.getSnapshot().context.gltfPresentation.presentedKey).toBe('a');

      actor.send({
        type: 'gltfDisplayReady',
        revision: 2,
        key: 'b',
        barrier: 'analysis-ready',
      });
      expect(actor.getSnapshot().context.gltfPresentation.phase).toBe('awaiting-analysis');
      actor.send({ type: 'gltfAnalysisReady', revision: 2, key: 'b' });
      actor.send({
        type: 'gltfPresentationCommitted',
        revision: 2,
        key: 'b',
        unitId: 'unit:b',
        manifest,
      });
      expect(actor.getSnapshot().context.gltfPresentation).toMatchObject({
        presentedRevision: 2,
        presentedKey: 'b',
        phase: 'presented',
      });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:b');
    } finally {
      actor.stop();
    }
  });

  it('keeps artifact source identity atomic through replacement and clearing', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const first = artifact();
      const second = artifact();
      actor.send({ type: 'updateArtifact', artifact: first, hash: 'first', sourceFile: 'first.scad' });
      actor.send({ type: 'updateArtifact', artifact: second, hash: 'second', sourceFile: 'second.scad' });
      expect(actor.getSnapshot().context).toMatchObject({
        artifact: second,
        artifactKey: 'second',
        artifactSourceFile: 'second.scad',
        gltfPresentation: { requestedRevision: 2, requestedKey: 'second' },
      });
      actor.send({ type: 'clearArtifact' });
      expect(actor.getSnapshot().context.artifactSourceFile).toBeUndefined();
      expect(actor.getSnapshot().context.artifact).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('measures a presentation onto the shared span model rather than a private ring', () => {
    clearRendererSpans();
    const viewerEvents: ViewerTelemetryEvent[] = [];
    const stopListening = onViewerEvent((event) => viewerEvents.push(event));
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({
        type: 'gltfPresentationMeasured',
        telemetry: { ...telemetry(7), triangleCount: 900, durations: { parse: 3, receiptToFirstFrame: 40 } },
      });
      actor.send({
        type: 'gltfPresentationMeasured',
        telemetry: { ...telemetry(8), outcome: 'failed', durations: { receiptToFirstFrame: 5 } },
      });

      /* FR-17: one closed first-frame event per presented model; a failed one is not a frame. */
      expect(viewerEvents).toEqual([{ event: 'first-frame', backend: 'webgl', duration: 40, triangles: 900 }]);

      /* D21: the frame that presented the geometry lands beside the worker spans that produced it,
       * under the renderer's own producer identity, instead of in a context field nothing read. */
      expect(rendererSpans()).toMatchObject([
        {
          name: 'renderer.presentation',
          duration: 40,
          origin: { label: 'renderer' },
          detail: { revision: 7, outcome: 'presented', backend: 'webgl', parse: 3, receiptToFirstFrame: 40 },
        },
        { name: 'renderer.presentation', detail: { revision: 8, outcome: 'failed' } },
      ]);
    } finally {
      stopListening();
      actor.stop();
      clearRendererSpans();
    }
  });
});

/*
 * G11b characterisation: the graphics side of the presentation actor's seams as they run today. Each row names what
 * the presentation actor keeps, or changes deliberately (charter D14).
 */
describe('graphics presentation seams the presentation actor keeps (G11b)', () => {
  const mechanism: Mechanism = {
    schemaVersion: 1,
    units: { length: 'm', angle: 'rad' },
    root: 'base',
    links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
    joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
  };

  it('should stamp a completed measurement with the kinematics revision current at completion', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const kinematics = actor.getSnapshot().context.kinematicsRef;
      kinematics.send({ type: 'loadMechanism', unitId: 'unit:a', mechanism });
      kinematics.send({ type: 'setCoordinate', unitId: 'unit:a', id: 'hinge', value: 0.5 });
      const { revision } = kinematics.getSnapshot().context;
      expect(revision).toBeGreaterThan(0);

      // The joint moved before Measure was turned on: the measure tool was not mounted, so only graphics' own
      // subscription to its kinematics child saw it.
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      actor.send({ type: 'completeMeasurement', payload: [1, 0, 0] });
      expect(actor.getSnapshot().context.measurements.at(-1)).toMatchObject({
        poseRevision: revision,
        status: 'current',
      });

      // The next reported pose change marks it out of date, because it carries the revision it was taken at.
      kinematics.send({ type: 'setCoordinate', unitId: 'unit:a', id: 'hinge', value: 1 });
      actor.send({ type: 'measurementPoseChanged', revision: kinematics.getSnapshot().context.revision });
      expect(actor.getSnapshot().context.measurements.at(-1)?.status).toBe('out-of-date');
    } finally {
      actor.stop();
    }
  });

  it('should stamp a measurement with the revision the measure tool reported before it started', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const kinematics = actor.getSnapshot().context.kinematicsRef;
      kinematics.send({ type: 'loadMechanism', unitId: 'unit:a', mechanism });
      actor.send({ type: 'setMeasureActive', payload: true });
      kinematics.send({ type: 'setCoordinate', unitId: 'unit:a', id: 'hinge', value: 0.5 });
      const { revision } = kinematics.getSnapshot().context;
      // The mounted measure tool reports every pose revision, as `measure-tool.tsx` does.
      actor.send({ type: 'measurementPoseChanged', revision });
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      actor.send({ type: 'completeMeasurement', payload: [1, 0, 0] });

      expect(actor.getSnapshot().context.measurements.at(-1)?.poseRevision).toBe(revision);
    } finally {
      actor.stop();
    }
  });

  it('should drop a half-placed measurement when the pose moves between its picks', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const kinematics = actor.getSnapshot().context.kinematicsRef;
      kinematics.send({ type: 'loadMechanism', unitId: 'unit:a', mechanism });
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      kinematics.send({ type: 'setCoordinate', unitId: 'unit:a', id: 'hinge', value: 1 });
      actor.send({ type: 'measurementPoseChanged', revision: kinematics.getSnapshot().context.revision });
      actor.send({ type: 'completeMeasurement', payload: [1, 0, 0] });

      expect(actor.getSnapshot().context.measurements).toEqual([]);
    } finally {
      actor.stop();
    }
  });

  it('should name the presented unit only once its commit lands, and forgets it when the artifact clears', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      // Requested but not presented: the view does not yet hold the unit's manifest.
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBeUndefined();

      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:a');

      // A newer request keeps the unit on screen until its own commit.
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'b' });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:a');
      actor.send({ type: 'gltfPresentationCommitted', revision: 2, key: 'b', unitId: 'unit:b', manifest });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:b');

      actor.send({ type: 'clearArtifact' });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBeUndefined();
      expect(actor.getSnapshot().context.artifact).toBeUndefined();
    } finally {
      actor.stop();
    }
  });
  it('should hand the model interaction each of two hashless GLBs in turn', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      // The host leaves a hashless request's manifest unhashed, so the second is not taken for the first.
      const first: GeometryComponentManifest = { ...manifest, geometryHash: undefined };
      const second: GeometryComponentManifest = { ...manifest, geometryHash: undefined, nodeOrder: ['root', 'part'] };
      const unitId = deriveModelInteractionUnitId({});
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: '' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: '', unitId, manifest: first });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: '' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 2, key: '', unitId, manifest: second });
      const held = actor.getSnapshot().context.modelInteractionRef.getSnapshot().context.unitsById[unitId]?.manifest;
      expect(held).toBe(second);
    } finally {
      actor.stop();
    }
  });

  it('should keep the unit named when a GLB of a file is replaced by a non-GLB artifact of the same file', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const unitId = deriveModelInteractionUnitId({ sourceFile: 'main.ts' });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a', sourceFile: 'main.ts' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId, manifest });

      actor.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
        hash: 'svg',
        sourceFile: 'main.ts',
      });

      // Same unit, other media: the view no longer presents the manifest, but the unit id does not change. The
      // project learns this only from the media type `presentedUnitChanged` carries, not from a unit change.
      const { context } = actor.getSnapshot();
      expect(context.modelInteractionUnitId).toBe(unitId);
      expect(context.artifact?.mimeType).toBe('image/svg+xml');
      expect(context.gltfPresentation).toMatchObject({ presentedKey: undefined, phase: 'idle' });
    } finally {
      actor.stop();
    }
  });
  it('should keep the presented unit and scene when a replacement fails', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'b' });
      actor.send({ type: 'gltfPresentationFailed', revision: 2, key: 'b' });

      // The old scene stays on screen, so the view still presents its unit.
      const { context } = actor.getSnapshot();
      expect(context.modelInteractionUnitId).toBe('unit:a');
      expect(context.gltfPresentation).toMatchObject({ presentedKey: 'a', presentedRevision: 1, phase: 'presented' });
    } finally {
      actor.stop();
    }
  });
  it('should raise the pickable mesh version on each commit and artifact change, but not on a GLB request', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const version = (): number => actor.getSnapshot().context.pickableMeshesVersion;
      const start = version();
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      expect(version()).toBe(start);
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest });
      expect(version()).toBe(start + 1);

      // The same key and manifest at a new revision is a new scene: Measure must drop its picks of the old one.
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 2, key: 'a', unitId: 'unit:a', manifest });
      expect(version()).toBe(start + 2);

      actor.send({ type: 'updateArtifact', artifact: { mimeType: 'image/svg+xml', content: '<svg/>' }, hash: 'svg' });
      expect(version()).toBe(start + 3);
      actor.send({ type: 'clearArtifact' });
      expect(version()).toBe(start + 4);
    } finally {
      actor.stop();
    }
  });
});

/*
 * G11b: the seams graphics now owns. The measurement folds the scene sphere, and the view reports the unit it
 * presents to its project.
 */
describe('graphics presentation events (G11b)', () => {
  const measurement = (
    key: string,
    min: [number, number, number],
    max: [number, number, number],
  ): Extract<GraphicsEvent, { type: 'geometryBoundsMeasured' }> => ({
    type: 'geometryBoundsMeasured',
    key,
    bounds: { min, max },
    radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2,
  });

  it('should fold each measured sphere into the scene sphere, and emit its radius only when the sphere changes', () => {
    const actor = createGraphicsActor();
    const radii: number[] = [];
    actor.on('geometryRadiusCalculated', (event) => radii.push(event.radius));
    actor.start();
    try {
      const first = measurement('a', [9, -2, -3], [11, 2, 3]);
      actor.send(first);
      expect(actor.getSnapshot().context).toMatchObject({ geometryRadius: first.radius, geometryCenter: [10, 0, 0] });

      // The same sphere measured again, as a settled pose or a new presentation of the same geometry is.
      actor.send(measurement('b', [9, -2, -3], [11, 2, 3]));
      expect(radii).toEqual([first.radius]);

      // A moved centre with the same radius is a new sphere.
      actor.send(measurement('b', [19, -2, -3], [21, 2, 3]));
      expect(actor.getSnapshot().context.geometryCenter).toEqual([20, 0, 0]);
      expect(radii).toEqual([first.radius, first.radius]);

      // An empty measurement keeps the sphere.
      actor.send({ ...measurement('c', [0, 0, 0], [0, 0, 0]), radius: 0 });
      expect(actor.getSnapshot().context.geometryRadius).toBe(first.radius);
      expect(radii).toHaveLength(2);

      // A cleared artifact forgets the sphere, so the same geometry measured again sets it once more.
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'd' });
      actor.send({ type: 'clearArtifact' });
      expect(actor.getSnapshot().context.geometryRadius).toBe(0);
      actor.send(measurement('b', [19, -2, -3], [21, 2, 3]));
      expect(radii).toHaveLength(3);
    } finally {
      actor.stop();
    }
  });

  it('should commit a presentation once when its scene is attached again, and again once it is prepared again', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      const commit = { type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest } as const;
      actor.send(commit);
      const version = actor.getSnapshot().context.pickableMeshesVersion;
      const snapshot = actor.getSnapshot();
      actor.send(commit);
      expect(actor.getSnapshot().context.pickableMeshesVersion).toBe(version);
      expect(actor.getSnapshot()).toBe(snapshot);

      // A scene prepared again for the same request (a remounted canvas, a new backend) commits again.
      actor.send({ type: 'gltfPreparationStarted', revision: 1, key: 'a' });
      actor.send(commit);
      expect(actor.getSnapshot().context.pickableMeshesVersion).toBe(version + 1);
      expect(actor.getSnapshot().context.gltfPresentation.phase).toBe('presented');
    } finally {
      actor.stop();
    }
  });

  it('should report the presented unit and media type each time either changes, and only then', () => {
    const actor = createGraphicsActor();
    const reports: Array<{ unitId: string | undefined; mediaType: string | undefined }> = [];
    actor.on('presentedUnitChanged', ({ unitId, mediaType }) => reports.push({ unitId, mediaType }));
    actor.start();
    try {
      const fileUnit = deriveModelInteractionUnitId({ sourceFile: 'main.ts' });
      const glb = 'model/gltf-binary';
      // A GLB request names no unit until its commit lands; a newer request keeps the presented unit.
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a', sourceFile: 'main.ts' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'b', sourceFile: 'main.ts' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 2, key: 'b', unitId: 'unit:a', manifest });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'c', sourceFile: 'main.ts' });
      actor.send({ type: 'gltfPresentationFailed', revision: 3, key: 'c' });
      // Other media of the same file, then nothing.
      actor.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
        hash: 'svg',
        sourceFile: 'main.ts',
      });
      actor.send({ type: 'clearArtifact' });
      actor.send({ type: 'clearArtifact' });
      // A host that loads a manifest itself names the unit too.
      actor.send({ type: 'loadModelComponentManifest', unitId: 'unit:host', manifest, source: 'viewer' });

      expect(reports).toEqual([
        { unitId: undefined, mediaType: glb },
        { unitId: 'unit:a', mediaType: glb },
        { unitId: fileUnit, mediaType: 'image/svg+xml' },
        { unitId: undefined, mediaType: undefined },
        { unitId: 'unit:host', mediaType: undefined },
      ]);
    } finally {
      actor.stop();
    }
  });
});

describe('graphics presentation actor (G11b)', () => {
  type HostCommand = PresentationHostCommand['type'] | 'stopped';

  /** A host that records what the presentation asks of it, and when it stops. */
  const recordingHost = (log: string[], name: string): PresentationHostLogic =>
    createCallbackLogic<PresentationHostCommand, undefined>(({ receive }) => {
      receive((command) => {
        log.push(
          command.type === 'prepare'
            ? `${name} prepare ${command.request.revision}:${command.request.key} ${command.request.unitId}`
            : `${name} ${command.type satisfies HostCommand}`,
        );
      });
      return () => {
        log.push(`${name} ${'stopped' satisfies HostCommand}`);
      };
    });

  const presentationState = (actor: ReturnType<typeof createGraphicsActor>): unknown =>
    actor.getSnapshot().context.presentationRef.getSnapshot().value;

  it('should hand each GLB request to the mounted host, and cancel it when the artifact clears or is not a GLB', () => {
    const actor = createGraphicsActor();
    const log: string[] = [];
    actor.start();
    try {
      const first = artifact();
      // A request made before any host waits for one.
      actor.send({ type: 'updateArtifact', artifact: first, hash: 'a', sourceFile: 'main.ts' });
      expect(presentationState(actor)).toBe('idle');
      actor.send({ type: 'presentationHostAttached', hostId: 'one', host: recordingHost(log, 'one') });
      expect(presentationState(actor)).toBe('preparing');
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'b', sourceFile: 'main.ts' });
      actor.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
        hash: 'svg',
        sourceFile: 'main.ts',
      });
      expect(presentationState(actor)).toBe('idle');
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'c' });
      actor.send({ type: 'clearArtifact' });

      const unit = (hash: string, sourceFile?: string): string =>
        deriveModelInteractionUnitId({ sourceFile, geometryHash: hash });
      expect(log).toEqual([
        `one prepare 1:a ${unit('a', 'main.ts')}`,
        `one prepare 2:b ${unit('b', 'main.ts')}`,
        'one cancel',
        `one prepare 4:c ${unit('c')}`,
        'one cancel',
      ]);
      expect(presentationState(actor)).toBe('idle');
    } finally {
      actor.stop();
    }
  });

  it('should hand the request its bytes, as graphics received them', () => {
    const actor = createGraphicsActor();
    const requests: PresentationRequest[] = [];
    actor.start();
    try {
      const glb = artifact();
      actor.send({
        type: 'presentationHostAttached',
        hostId: 'one',
        host: createCallbackLogic<PresentationHostCommand, undefined>(({ receive }) => {
          receive((command) => {
            if (command.type === 'prepare') {
              requests.push(command.request);
            }
          });
        }),
      });
      actor.send({ type: 'updateArtifact', artifact: glb, hash: 'a', sourceFile: 'main.ts' });
      expect(requests).toEqual([
        {
          revision: 1,
          key: 'a',
          unitId: deriveModelInteractionUnitId({ sourceFile: 'main.ts', geometryHash: 'a' }),
          sourceFile: 'main.ts',
          bytes: glb.content,
        },
      ]);
      expect(requests[0]?.bytes).toBe(glb.content);
    } finally {
      actor.stop();
    }
  });

  it('should stop a host that leaves, ignore a stale leave, and prepare the request in hand on the next host', () => {
    const actor = createGraphicsActor();
    const log: string[] = [];
    actor.start();
    try {
      actor.send({ type: 'presentationHostAttached', hostId: 'one', host: recordingHost(log, 'one') });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      // A new host replaces the old one, which stops, and prepares the request in hand again.
      actor.send({ type: 'presentationHostAttached', hostId: 'two', host: recordingHost(log, 'two') });
      // The old host's leave arrives late: the new host keeps the slot.
      actor.send({ type: 'presentationHostDetached', hostId: 'one' });
      expect(presentationState(actor)).toBe('preparing');
      actor.send({ type: 'presentationHostDetached', hostId: 'two' });
      expect(presentationState(actor)).toBe('idle');
      actor.send({ type: 'presentationHostAttached', hostId: 'three', host: recordingHost(log, 'three') });

      const unit = deriveModelInteractionUnitId({ geometryHash: 'a' });
      expect(log).toEqual([
        `one prepare 1:a ${unit}`,
        'one stopped',
        `two prepare 1:a ${unit}`,
        'two stopped',
        `three prepare 1:a ${unit}`,
      ]);
    } finally {
      actor.stop();
    }
    // Graphics stops the presentation, and the presentation its host.
    expect(log.at(-1)).toBe('three stopped');
  });

  it('should follow the request through the section barrier to presented or failed, by revision and key', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'presentationHostAttached', hostId: 'one', host: recordingHost([], 'one') });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfDisplayReady', revision: 1, key: 'a', barrier: 'analysis-ready' });
      expect(presentationState(actor)).toBe('awaitingAnalysis');
      // A stale outcome changes nothing.
      actor.send({ type: 'gltfAnalysisReady', revision: 1, key: 'stale' });
      expect(presentationState(actor)).toBe('awaitingAnalysis');
      actor.send({ type: 'gltfAnalysisReady', revision: 1, key: 'a' });
      expect(presentationState(actor)).toBe('preparing');
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest });
      expect(presentationState(actor)).toBe('presented');
      // A section armed after the commit analyses the presented scene, which stays presented in both.
      actor.send({ type: 'gltfAnalysisReady', revision: 1, key: 'a' });
      expect(presentationState(actor)).toBe('presented');
      expect(actor.getSnapshot().context.gltfPresentation.phase).toBe('presented');

      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'b' });
      actor.send({ type: 'gltfDisplayReady', revision: 2, key: 'b', barrier: 'display-ready' });
      expect(presentationState(actor)).toBe('preparing');
      actor.send({ type: 'gltfPresentationFailed', revision: 1, key: 'a' });
      expect(presentationState(actor)).toBe('preparing');
      actor.send({ type: 'gltfPresentationFailed', revision: 2, key: 'b' });
      expect(presentationState(actor)).toBe('failed');
    } finally {
      actor.stop();
    }
  });

  it('should frame a focused component of the presented unit once, in Tau world space, and again after a clear', () => {
    const framed: unknown[] = [];
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      {
        input: {},
        inspect: (inspection) => {
          // The camera's transitions: what the view frames.
          if (inspection.type === '@xstate.transition' && inspection.event.type === 'frameBounds') {
            framed.push(inspection.event);
          }
        },
      },
    );
    actor.start();
    try {
      const bounds: GeometryComponentBounds = { min: [0, 1, 2], max: [1, 2, 4], center: [0.5, 1.5, 3], radius: 1.22 };
      const focusable: GeometryComponentManifest = {
        ...manifest,
        nodeOrder: ['root', 'part', 'bare'],
        nodesById: {
          ...manifest.nodesById,
          part: { ...manifest.nodesById['root']!, id: 'part', kind: 'part', bounds },
          bare: { ...manifest.nodesById['root']!, id: 'bare', kind: 'part' },
        },
      };
      // Another view of the unit presents other geometry, with the part elsewhere, and focuses it: nothing is presented
      // here yet, so nothing is framed.
      const elsewhere: GeometryComponentManifest = {
        ...focusable,
        nodesById: {
          ...focusable.nodesById,
          part: { ...focusable.nodesById['part']!, bounds: { ...bounds, min: [-5, -5, -5], max: [-4, -4, -4] } },
        },
      };
      actor.send({ type: 'loadModelComponentManifest', unitId: 'unit:a', manifest: elsewhere, source: 'viewer' });
      actor.send({ type: 'focusModelComponent', unitId: 'unit:a', componentId: 'part' });
      expect(framed).toEqual([]);

      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest: focusable });
      // The commit frames the focus it finds once, at the bounds of the geometry this view presents.
      const box = applyCanonicalGltfBounds(new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)));
      const expected = {
        type: 'frameBounds',
        bounds: { min: box.min.toArray(), max: box.max.toArray() },
        margin: 0.1,
        source: 'focus',
      };
      expect(framed).toEqual([expected]);

      // The same focus again, or a component without bounds, frames nothing.
      actor.send({ type: 'focusModelComponent', unitId: 'unit:a', componentId: 'part' });
      actor.send({ type: 'focusModelComponent', unitId: 'unit:a', componentId: 'bare' });
      expect(framed).toHaveLength(1);

      // A cleared focus leaves the camera, and focusing the part again frames it again.
      actor.send({ type: 'clearModelComponentFocus', unitId: 'unit:a' });
      expect(framed).toHaveLength(1);
      actor.send({ type: 'focusModelComponent', unitId: 'unit:a', componentId: 'part' });
      expect(framed).toEqual([expected, expected]);
    } finally {
      actor.stop();
    }
  });

  it('should frame nothing at a commit whose manifest has no node for the focused component', () => {
    const framed: unknown[] = [];
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      {
        input: {},
        inspect: (inspection) => {
          if (inspection.type === '@xstate.transition' && inspection.event.type === 'frameBounds') {
            framed.push(inspection.event);
          }
        },
      },
    );
    actor.start();
    try {
      const bounds: GeometryComponentBounds = { min: [0, 0, 0], max: [1, 1, 1], center: [0.5, 0.5, 0.5], radius: 0.87 };
      const withPart: GeometryComponentManifest = {
        ...manifest,
        nodeOrder: ['root', 'part'],
        nodesById: {
          ...manifest.nodesById,
          part: { ...manifest.nodesById['root']!, id: 'part', kind: 'part', bounds },
        },
      };
      actor.send({ type: 'loadModelComponentManifest', unitId: 'unit:a', manifest: withPart, source: 'viewer' });
      actor.send({ type: 'focusModelComponent', unitId: 'unit:a', componentId: 'part' });
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest });
      expect(framed).toEqual([]);
    } finally {
      actor.stop();
    }
  });

  const sharedFocusRig = () => {
    const framed: unknown[] = [];
    const shared = createActor(modelInteractionMachine, { input: {} }).start();
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      {
        input: { modelInteractionRef: shared },
        inspect: (inspection) => {
          if (inspection.type === '@xstate.transition' && inspection.event.type === 'frameBounds') {
            framed.push(inspection.event);
          }
        },
      },
    );
    // What the project, which owns the shared model interaction, forwards to each view.
    const forward = (): void => {
      actor.send({ type: 'componentFocusObserved', focus: selectComponentFocus(shared.getSnapshot().context) });
    };
    return { framed, shared, actor, forward };
  };

  const partBounds: GeometryComponentBounds = { min: [0, 0, 0], max: [1, 2, 3], center: [0.5, 1, 1.5], radius: 1.87 };
  const withPart: GeometryComponentManifest = {
    ...manifest,
    nodeOrder: ['root', 'part'],
    nodesById: {
      ...manifest.nodesById,
      part: { ...manifest.nodesById['root']!, id: 'part', kind: 'part', bounds: partBounds },
    },
  };
  const framedPart = () => {
    const box = applyCanonicalGltfBounds(new Box3(new Vector3(...partBounds.min), new Vector3(...partBounds.max)));
    return {
      type: 'frameBounds',
      bounds: { min: box.min.toArray(), max: box.max.toArray() },
      margin: 0.1,
      source: 'focus',
    };
  };

  it('should frame a focus another view set before this view started, once the host forwards it and the unit commits', () => {
    const { framed, shared, actor, forward } = sharedFocusRig();
    // The other view loaded the unit and focused its part before this view's graphics existed.
    shared.send({ type: 'loadManifest', unitId: 'unit:a', manifest: withPart, source: 'viewer' });
    shared.send({ type: 'focusComponent', unitId: 'unit:a', componentId: 'part' });
    actor.start();
    try {
      forward();
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest: withPart });
      expect(framed).toEqual([framedPart()]);
    } finally {
      actor.stop();
      shared.stop();
    }
  });

  it('should not observe a model interaction it shares, and frame a later focus at the bounds this view presents', () => {
    const { framed, shared, actor, forward } = sharedFocusRig();
    actor.start();
    try {
      actor.send({ type: 'updateArtifact', artifact: artifact(), hash: 'a' });
      actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a', unitId: 'unit:a', manifest: withPart });
      // Another pane of the unit presents other geometry, with the part elsewhere, and its manifest is the shared one.
      const elsewhere: GeometryComponentManifest = {
        ...withPart,
        nodesById: {
          ...withPart.nodesById,
          part: { ...withPart.nodesById['part']!, bounds: { ...partBounds, min: [-5, -5, -5], max: [-4, -4, -4] } },
        },
      };
      shared.send({ type: 'loadManifest', unitId: 'unit:a', manifest: elsewhere, source: 'viewer' });
      shared.send({ type: 'focusComponent', unitId: 'unit:a', componentId: 'part' });
      // Graphics does not subscribe to an actor it does not own (MC-R11): the host forwards the focus.
      expect(framed).toEqual([]);
      forward();
      expect(framed).toEqual([framedPart()]);
    } finally {
      actor.stop();
      shared.stop();
    }
  });
});
