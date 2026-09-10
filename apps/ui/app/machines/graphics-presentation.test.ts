import { createActor, fromPromise } from 'xstate';
import { describe, expect, it } from 'vitest';
import type { GeometryComponentManifest } from '@taucad/types';
import type { GltfPresentationTelemetry } from '#machines/graphics.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = () =>
  createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: fromPromise(async () => false) },
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

  it('keeps only the twenty newest completed telemetry records', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      for (let revision = 1; revision <= 24; revision += 1) {
        actor.send({
          type: 'gltfPresentationMeasured',
          telemetry: telemetry(revision),
        });
      }
      expect(actor.getSnapshot().context.gltfPresentation.recentTelemetry).toHaveLength(20);
      expect(actor.getSnapshot().context.gltfPresentation.recentTelemetry[0]?.revision).toBe(5);
      expect(actor.getSnapshot().context.gltfPresentation.recentTelemetry.at(-1)?.revision).toBe(24);
    } finally {
      actor.stop();
    }
  });
});
