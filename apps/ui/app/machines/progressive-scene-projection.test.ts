// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProgressiveSceneUpdate, ResolvedSceneAsset, SceneNodeId, TauSceneNode } from '@taucad/runtime';
import {
  applyProgressiveSceneUpdate,
  createProgressiveSceneProjection,
  rehydrateProgressiveSceneFrame,
  selectProgressiveSceneFrame,
  selectProgressiveSceneSequence,
} from '#machines/progressive-scene-projection.js';

type SceneDigest = Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>['sceneDigest'];
type ContentDigest = ResolvedSceneAsset['contentDigest'];

const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const nodeId = (id: string): SceneNodeId => id as SceneNodeId;
const digest = (id: string): SceneDigest => id as SceneDigest;
const contentDigest = (id: string): ContentDigest => id as ContentDigest;
const node = (id: string, asset?: ResolvedSceneAsset): TauSceneNode => ({
  id: nodeId(id),
  childIds: [],
  transform,
  visible: true,
  geometry: asset,
});
const asset = (id: string, bytes = 1): ResolvedSceneAsset => ({
  contentDigest: contentDigest(id),
  mediaType: 'model/gltf-binary',
  byteLength: bytes,
  geometry: { format: 'gltf', content: new Uint8Array(bytes) },
});

const initialReset = (): Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }> => {
  const a = asset('asset-a');
  const b = asset('asset-b');
  return {
    type: 'reset',
    renderId: 'render-a',
    sequence: 0,
    revision: 0,
    sceneDigest: digest('scene-0'),
    skippedBefore: 0,
    snapshot: {
      manifest: {
        schemaVersion: 1,
        rootNodeIds: [nodeId('a'), nodeId('b')],
        nodes: { a: node('a', a), b: node('b', b) },
        presentation: {},
      },
      assets: [a, b],
    },
  };
};

describe('progressive scene projection', () => {
  it('folds a delta while retaining unchanged node object identity', () => {
    let projection = applyProgressiveSceneUpdate(createProgressiveSceneProjection(), initialReset());
    const before = selectProgressiveSceneFrame(projection, 0)!;
    const changed = { ...before.snapshot.manifest.nodes['a']!, visible: false };
    const delta: ProgressiveSceneUpdate = {
      type: 'delta',
      renderId: 'render-a',
      sequence: 1,
      baseRevision: 0,
      revision: 1,
      baseSceneDigest: digest('scene-0'),
      sceneDigest: digest('scene-1'),
      operations: [{ type: 'upsert-node', node: changed }],
      assets: [],
    };
    projection = applyProgressiveSceneUpdate(projection, delta);

    const after = selectProgressiveSceneFrame(projection, 1)!;
    expect(after.snapshot.manifest.nodes['a']).toBe(changed);
    expect(after.snapshot.manifest.nodes['b']).toBe(before.snapshot.manifest.nodes['b']);
  });

  it('applies refinements without changing semantic revision and replaces only the target node asset', () => {
    let projection = applyProgressiveSceneUpdate(createProgressiveSceneProjection(), initialReset());
    const replacement = asset('asset-a-fine');
    projection = applyProgressiveSceneUpdate(projection, {
      type: 'refinement',
      renderId: 'render-a',
      sequence: 1,
      revision: 0,
      sceneDigest: digest('scene-0'),
      replacements: [
        {
          nodeId: nodeId('a'),
          previous: contentDigest('asset-a'),
          replacement,
        },
      ],
    });

    const frame = selectProgressiveSceneFrame(projection, 1)!;
    expect(frame.revision).toBe(0);
    expect(frame.snapshot.manifest.nodes['a']?.geometry?.contentDigest).toBe(replacement.contentDigest);
    expect(frame.snapshot.manifest.nodes['b']).toBe(
      selectProgressiveSceneFrame(projection, 0)?.snapshot.manifest.nodes['b'],
    );
    expect(new Set(frame.snapshot.assets.map(({ contentDigest: id }) => id))).toEqual(
      new Set([contentDigest('asset-b'), contentDigest('asset-a-fine')]),
    );
    expect(frame.snapshot.assets).toHaveLength(2);
  });

  it('rejects an invalid delta base and recovers on reset', () => {
    let projection = applyProgressiveSceneUpdate(createProgressiveSceneProjection(), initialReset());
    projection = applyProgressiveSceneUpdate(projection, {
      type: 'delta',
      renderId: 'render-a',
      sequence: 1,
      baseRevision: 99,
      revision: 100,
      baseSceneDigest: digest('wrong'),
      sceneDigest: digest('scene-100'),
      operations: [],
      assets: [],
    });
    expect(projection.status).toBe('recovering');
    expect(projection.frames).toHaveLength(1);

    projection = applyProgressiveSceneUpdate(projection, {
      ...initialReset(),
      sequence: 2,
      revision: 2,
      sceneDigest: digest('scene-2'),
    });
    expect(projection.status).toBe('ready');
    expect(projection.frames.at(-1)?.sequence).toBe(2);
  });

  it('evicts complete folded frames to stay within byte and count limits', () => {
    let projection = applyProgressiveSceneUpdate(createProgressiveSceneProjection(), initialReset(), {
      maxFrames: 1,
      maxBytes: 2,
    });
    projection = applyProgressiveSceneUpdate(
      projection,
      { ...initialReset(), sequence: 1, revision: 1, sceneDigest: digest('scene-1') },
      { maxFrames: 1, maxBytes: 2 },
    );
    expect(projection.frames).toHaveLength(1);
    expect(projection.frames[0]?.sequence).toBe(1);
    expect(projection.retainedBytes).toBe(2);
  });

  it('pins a restored selected frame outside both limits until the user resumes live', () => {
    const limits = { maxFrames: 1, maxBytes: 1 };
    const initial = initialReset();
    let projection = applyProgressiveSceneUpdate(createProgressiveSceneProjection(), initial, limits);
    projection = applyProgressiveSceneUpdate(
      projection,
      { ...initial, sequence: 1, revision: 1, sceneDigest: digest('scene-1') },
      limits,
    );
    projection = selectProgressiveSceneSequence(projection, 1, limits);
    projection = selectProgressiveSceneSequence(projection, 0, limits);
    projection = rehydrateProgressiveSceneFrame(
      projection,
      {
        renderId: initial.renderId,
        sequence: initial.sequence,
        revision: initial.revision,
        sceneDigest: initial.sceneDigest,
        snapshot: initial.snapshot,
      },
      limits,
    );

    expect(projection.frames).toHaveLength(2);
    expect(projection.retainedBytes).toBe(2);
    expect(selectProgressiveSceneFrame(projection, 0)?.snapshot).toBe(initial.snapshot);
    expect(selectProgressiveSceneFrame(projection, 1)).toBeDefined();

    projection = selectProgressiveSceneSequence(projection, 1, limits);
    expect(projection.selectedSequence).toBe(1);
    expect(selectProgressiveSceneFrame(projection, 0)).toBeUndefined();
  });
});
