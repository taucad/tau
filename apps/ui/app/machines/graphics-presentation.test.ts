import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';
import type { GeometryComponentManifest } from '@taucad/types';
import type { GltfPresentationTelemetry } from '#machines/graphics.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = () =>
  createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) },
    }),
    { input: {} },
  );

const geometry = (hash: string): { format: 'gltf'; hash: string; content: Uint8Array<ArrayBuffer> } => ({
  format: 'gltf',
  hash,
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
        type: 'updateGeometry',
        geometry: geometry('a'),
        units: { length: 'mm' },
      });
      actor.send({
        type: 'gltfPresentationCommitted',
        revision: 1,
        key: 'a',
        unitId: 'unit:a',
        manifest,
      });
      actor.send({
        type: 'updateGeometry',
        geometry: geometry('b'),
        units: { length: 'mm' },
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
