import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';
import type { GeometryComponentManifest } from '@taucad/types';
import { writeGlb } from '@taucad/geometry-core';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { GltfPresentationTelemetry } from '#machines/graphics.machine.js';
import { graphicsMachine, isAssemblyDetailCalibration } from '#machines/graphics.machine.js';

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
  it('should serialize assembly calibration and unknown inventory inside the existing scalar renderer span', () => {
    clearRendererSpans();
    const actor = createGraphicsActor();
    actor.start();
    try {
      const assemblyResources: NonNullable<GltfPresentationTelemetry['assemblyResources']> = {
        validatedSourceBytes: 0,
        residentCompressedBytes: 0,
        geometryCpuBytes: 0,
        geometryGpuBytesEstimate: 0,
        instanceAttributeCpuBytes: 0,
        instanceAttributeGpuBytesEstimate: 0,
        instanceSlotDescriptorsSerializedBytes: 0,
        exactResidentBufferCpuBytes: 128,
        currentAndCandidateExactBufferCpuBytes: 256,
        detailGeometryCount: 0,
        detailUploadGpuBytesEstimate: 0,
        detailDecisionSerializedBytes: 0,
        edgeCpuBytes: 0,
        edgeGpuBytesEstimate: 0,
        surfaceBatchCount: 0,
        edgeBatchCount: 0,
        wrapperObjectCount: 0,
        canonicalSurfaceTriangleCount: 0,
        detailSurfaceTriangleCount: 0,
        mandatoryEdgeTriangleCount: 0,
        textureCpuBytesEstimate: 0,
        textureGpuBytesEstimate: 0,
        texturesWithUnknownSize: 0,
        bvhTreeCount: 0,
        bvhTreesWithUnknownSize: 0,
        bvhBytesEstimate: 0,
        metadataSerializedBytes: 0,
        demandIndexCpuBytes: 0,
        demandDescriptorsSerializedBytes: 0,
        parserJsonSerializedBytes: 0,
        parsedDependencyCpuBytes: 0,
        parserObjectCount: 0,
        currentAndCandidateBytesEstimate: 0,
        definitionCount: 0,
        residentOccurrenceCount: 0,
        queuedPreparationCount: 0,
        sceneObjectCount: 0,
        materialCount: 0,
        detailCalibration: {
          maxProjectedApproximateErrorPixels: 1.2,
          projectionUnavailableCount: 0,
          selectedFullEvidenceCount: 1,
        },
        unmeasuredInventory: ['reader buffers', 'backend wrappers'],
      };
      actor.send({
        type: 'gltfPresentationMeasured',
        telemetry: { ...telemetry(8), candidateSceneId: 'actual-candidate-scene', assemblyResources },
      });
      const detail = rendererSpans().at(-1)?.detail;
      expect(detail).toMatchObject({
        key: 'geometry-8',
        candidateSceneId: 'actual-candidate-scene',
        viewportActorSessionId: actor.sessionId,
        exactResidentBufferCpuBytes: 128,
        currentAndCandidateExactBufferCpuBytes: 256,
        detailCalibrationJson: JSON.stringify(assemblyResources.detailCalibration),
        unmeasuredInventoryJson: JSON.stringify(assemblyResources.unmeasuredInventory),
      });
      const otherViewport = createGraphicsActor();
      otherViewport.start();
      try {
        otherViewport.send({ type: 'gltfPresentationMeasured', telemetry: { ...telemetry(8), assemblyResources } });
        expect(rendererSpans().at(-1)?.detail).toMatchObject({
          key: 'geometry-8',
          viewportActorSessionId: otherViewport.sessionId,
        });
        expect(otherViewport.sessionId).not.toBe(actor.sessionId);
      } finally {
        otherViewport.stop();
      }
      expect(detail).not.toHaveProperty('detailCalibration');
      expect(detail).not.toHaveProperty('unmeasuredInventory');
      expect(Object.values(detail ?? {}).every((value) => ['string', 'number', 'boolean'].includes(typeof value))).toBe(
        true,
      );
    } finally {
      actor.stop();
      clearRendererSpans();
    }
  });

  it('should publish assembly components under their current source unit and reject a stale source commit', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      const sourceFile = 'parity/flat-actions.assembly.json';
      const bytes = writeGlb({
        nodes: [
          {
            name: 'Parity opaque',
            primitives: [{ mode: 4, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), material: {} }],
          },
        ],
      });
      const components = buildGltfComponentManifest(bytes, { sourceFile });
      const ordinaryArtifact: ReturnType<typeof artifact> = { mimeType: 'model/gltf-binary', content: bytes };
      actor.send({ type: 'updateArtifact', artifact: ordinaryArtifact, hash: 'ordinary', sourceFile: 'ordinary.ts' });
      expect(actor.getSnapshot().context.artifact).toBe(ordinaryArtifact);
      const sourceUnitId = deriveModelInteractionUnitId({ sourceFile });
      actor.send({ type: 'updateAssembly', key: 'first', units: { length: 'mm' }, sourceFile: 'parity/assembly.json' });
      actor.send({ type: 'updateAssembly', key: 'current', units: { length: 'mm' }, sourceFile });
      const { artifactSourceFile, artifactKey, gltfPresentation, modelInteractionRef } = actor.getSnapshot().context;
      const renderedUnitId = deriveModelInteractionUnitId({
        sourceFile: artifactSourceFile,
        geometryHash: gltfPresentation.requestedKey,
      });
      expect(actor.getSnapshot().context.artifact).toBeUndefined();
      expect(artifactKey).toBe('current');
      expect(renderedUnitId).toBe(sourceUnitId);
      expect(gltfPresentation).toMatchObject({ requestedKey: 'current', requestedRevision: 3 });
      actor.send({
        type: 'gltfPresentationCommitted',
        key: 'first',
        revision: 2,
        unitId: 'file:parity/assembly.json',
        manifest: components,
      });
      expect(
        getModelInteractionUnitState(modelInteractionRef.getSnapshot().context, sourceUnitId).manifest,
      ).toBeUndefined();
      actor.send({
        type: 'gltfPresentationCommitted',
        key: 'current',
        revision: 3,
        unitId: renderedUnitId,
        manifest: components,
      });
      const current = getModelInteractionUnitState(modelInteractionRef.getSnapshot().context, sourceUnitId).manifest;
      expect(current).toBe(components);
      expect(current?.nodesById[current.rootId]?.childIds).toHaveLength(1);
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe(sourceUnitId);
      actor.send({ type: 'clearArtifact' });
      expect(actor.getSnapshot().context.artifactSourceFile).toBeUndefined();
      expect(
        getModelInteractionUnitState(modelInteractionRef.getSnapshot().context, sourceUnitId).manifest,
      ).toBeUndefined();
      actor.send({ type: 'updateAssembly', key: 'anonymous', units: { length: 'mm' } });
      expect(actor.getSnapshot().context.artifactSourceFile).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('should validate private assembly calibration without changing requested or presented authority', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'updateAssembly', key: 'a', units: { length: 'mm' } });
      actor.send({ type: 'gltfPresentationCommitted', key: 'a', revision: 1, unitId: 'unit:a', manifest });
      const before = actor.getSnapshot().context.gltfPresentation;
      const calibration = {
        triangleRatio: 0.5,
        approximateRelativeError: 0.05,
        screenSpace: { maxApproximatePixelError: 2, enterDetailRatio: 0.6 },
      };
      actor.send({ type: 'setAssemblyDetailCalibration', calibration });
      const stored = actor.getSnapshot().context.assemblyDetailCalibration;
      expect(stored).toEqual(calibration);
      expect(stored).not.toBe(calibration);
      expect(stored?.screenSpace).not.toBe(calibration.screenSpace);
      calibration.screenSpace.maxApproximatePixelError = 90;
      expect(stored?.screenSpace.maxApproximatePixelError).toBe(2);
      const invalid = [
        { ...calibration, triangleRatio: 0 },
        { ...calibration, triangleRatio: 1 },
        { ...calibration, triangleRatio: Number.NaN },
        { ...calibration, approximateRelativeError: -1 },
        { ...calibration, approximateRelativeError: Infinity },
        { ...calibration, screenSpace: { maxApproximatePixelError: 0, enterDetailRatio: 0.6 } },
        { ...calibration, screenSpace: { maxApproximatePixelError: Infinity, enterDetailRatio: 0.6 } },
        { ...calibration, screenSpace: { maxApproximatePixelError: 2, enterDetailRatio: 1 } },
      ];
      for (const candidate of invalid) {
        expect(isAssemblyDetailCalibration(candidate)).toBe(false);
        actor.send({ type: 'setAssemblyDetailCalibration', calibration: candidate });
        expect(actor.getSnapshot().context.assemblyDetailCalibration).toBe(stored);
      }
      for (const candidate of [
        null,
        {},
        { triangleRatio: 0.5, approximateRelativeError: 0 },
        { triangleRatio: 0.5, approximateRelativeError: 0, screenSpace: null },
      ]) {
        expect(isAssemblyDetailCalibration(candidate)).toBe(false);
      }
      expect(actor.getSnapshot().context.gltfPresentation).toBe(before);
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:a');
      actor.send({ type: 'setAssemblyDetailCalibration' });
      expect(actor.getSnapshot().context.assemblyDetailCalibration).toBeUndefined();
      expect(actor.getSnapshot().context.gltfPresentation).toBe(before);
    } finally {
      actor.stop();
    }
  });

  it('releases only the matching displayed scene and preserves the requested assembly for retry', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'updateAssembly', key: 'a', units: { length: 'mm' } });
      actor.send({ type: 'gltfPresentationCommitted', key: 'a', revision: 1, unitId: 'unit:a', manifest });
      actor.send({ type: 'updateAssembly', key: 'b', units: { length: 'mm' } });
      actor.send({ type: 'gltfPresentationCommitted', key: 'b', revision: 2, unitId: 'unit:b', manifest });
      actor.send({ type: 'gltfPresentationReleased', key: 'a', revision: 1 });
      actor.send({ type: 'gltfPresentationReleased', key: 'b', revision: 1 });
      expect(actor.getSnapshot().context.gltfPresentation).toMatchObject({
        presentedKey: 'b',
        presentedRevision: 2,
        phase: 'presented',
      });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBe('unit:b');
      actor.send({ type: 'gltfPresentationReleased', key: 'b', revision: 2 });
      expect(actor.getSnapshot().context.gltfPresentation).toMatchObject({
        requestedKey: 'b',
        requestedRevision: 2,
        presentedKey: undefined,
        phase: 'preparing',
      });
      expect(actor.getSnapshot().context.modelInteractionUnitId).toBeUndefined();
      actor.send({ type: 'gltfPresentationCommitted', key: 'b', revision: 2, unitId: 'unit:b-retry', manifest });
      expect(actor.getSnapshot().context.gltfPresentation.presentedKey).toBe('b');
      actor.send({ type: 'updateAssembly', key: 'c', units: { length: 'mm' } });
      actor.send({ type: 'gltfPresentationReleased', key: 'b', revision: 2 });
      expect(actor.getSnapshot().context.gltfPresentation).toMatchObject({
        requestedKey: 'c',
        requestedRevision: 3,
        presentedKey: undefined,
      });
    } finally {
      actor.stop();
    }
  });

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
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({
        type: 'gltfPresentationMeasured',
        telemetry: { ...telemetry(7), durations: { parse: 3, receiptToFirstFrame: 40 } },
      });

      /* D21: the frame that presented the geometry lands beside the worker spans that produced it,
       * under the renderer's own producer identity, instead of in a context field nothing read. */
      expect(rendererSpans()).toMatchObject([
        {
          name: 'renderer.presentation',
          duration: 40,
          origin: { label: 'renderer' },
          detail: { revision: 7, outcome: 'presented', backend: 'webgl', parse: 3, receiptToFirstFrame: 40 },
        },
      ]);
    } finally {
      actor.stop();
      clearRendererSpans();
    }
  });
});
