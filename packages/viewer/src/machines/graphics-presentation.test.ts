import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { clearRendererSpans, onViewerEvent, rendererSpans } from '#lib/renderer-telemetry.js';
import type { ViewerTelemetryEvent } from '#lib/viewer-events.js';
import type { GeometryComponentManifest } from '@taucad/types';
import type { Mechanism } from '@taucad/kinematics';
import type { GltfPresentationTelemetry } from '#machines/graphics.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId } from '#machines/model-interaction.machine.js';

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
describe('graphics presentation seams before the presentation actor (G11b characterisation)', () => {
  const mechanism: Mechanism = {
    schemaVersion: 1,
    units: { length: 'm', angle: 'rad' },
    root: 'base',
    links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
    joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
  };

  it('should stamp a completed measurement with the kinematics revision it reads at completion', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const kinematics = actor.getSnapshot().context.kinematicsRef;
      kinematics.send({ type: 'loadMechanism', unitId: 'unit:a', mechanism });
      kinematics.send({ type: 'setCoordinate', unitId: 'unit:a', id: 'hinge', value: 0.5 });
      const { revision } = kinematics.getSnapshot().context;
      expect(revision).toBeGreaterThan(0);

      // The joint moved before Measure was turned on: the measure tool was not mounted, so nothing reported it.
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
      // project learns this only from the media type (`reconcileViewManifest`), not from a unit change.
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
});
