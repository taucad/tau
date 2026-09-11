import { describe, expect, it } from 'vitest';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';

const renderId = '550e8400-e29b-41d4-a716-446655440000';
const digest = `sha256:${'0'.repeat(64)}`;
const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

const snapshot = {
  manifest: {
    schemaVersion: 1,
    rootNodeIds: ['root'],
    nodes: {
      root: {
        id: 'root',
        childIds: [],
        geometry: { contentDigest: digest, mediaType: 'model/gltf-binary', byteLength: 3 },
        transform,
        visible: true,
      },
    },
    presentation: {},
  },
  assets: [
    {
      delivery: 'inline',
      contentDigest: digest,
      mediaType: 'model/gltf-binary',
      byteLength: 3,
      geometry: {
        format: 'gltf',
        content: { delivery: 'inline', bytes: new Uint8Array([1, 2, 3]) },
        hash: digest,
      },
    },
  ],
} as const;

describe('progressive scene wire schemas', () => {
  it('accepts independently reconstructible reset updates', () => {
    const parsed = runtimeProtocolSchemas.listens.sceneUpdates.event.parse({
      type: 'reset',
      renderId,
      sequence: 1,
      revision: 1,
      sceneDigest: digest,
      snapshot,
      skippedBefore: 0,
    });

    expect(parsed.type).toBe('reset');
  });

  it('accepts content references and rejects ambiguous asset deliveries', () => {
    const referenceSnapshot = {
      ...snapshot,
      assets: [
        {
          delivery: 'reference',
          contentDigest: digest,
          mediaType: 'model/gltf-binary',
          byteLength: 3,
        },
      ],
    } as const;
    const event = {
      type: 'reset',
      renderId,
      sequence: 2,
      revision: 2,
      sceneDigest: digest,
      snapshot: referenceSnapshot,
      skippedBefore: 0,
    } as const;

    expect(runtimeProtocolSchemas.listens.sceneUpdates.event.safeParse(event).success).toBe(true);
    expect(
      runtimeProtocolSchemas.listens.sceneUpdates.event.safeParse({
        ...event,
        snapshot: {
          ...referenceSnapshot,
          assets: [{ ...referenceSnapshot.assets[0], geometry: snapshot.assets[0].geometry }],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects malformed digests, transforms, and non-UUID render identities', () => {
    const base = {
      type: 'reset',
      renderId,
      sequence: 1,
      revision: 1,
      sceneDigest: digest,
      snapshot,
      skippedBefore: 0,
    } as const;

    expect(runtimeProtocolSchemas.listens.sceneUpdates.event.safeParse({ ...base, sceneDigest: 'hash' }).success).toBe(
      false,
    );
    expect(
      runtimeProtocolSchemas.listens.sceneUpdates.event.safeParse({
        ...base,
        snapshot: {
          ...snapshot,
          manifest: {
            ...snapshot.manifest,
            nodes: { root: { ...snapshot.manifest.nodes.root, transform: [1, 0, 0] } },
          },
        },
      }).success,
    ).toBe(false);
    expect(runtimeProtocolSchemas.listens.sceneUpdates.event.safeParse({ ...base, renderId: 'render-1' }).success).toBe(
      false,
    );
  });

  it('validates retained snapshot lookup and stream cursors', () => {
    expect(runtimeProtocolSchemas.calls.readSceneSnapshot.args.parse({ bookmarkId: 'bookmark-1' })).toEqual({
      bookmarkId: 'bookmark-1',
    });
    expect(runtimeProtocolSchemas.calls.listSceneBookmarks.args.parse({ renderId })).toEqual({ renderId });
    expect(runtimeProtocolSchemas.listens.sceneUpdates.args.parse({ afterSequence: 12 })).toEqual({
      afterSequence: 12,
    });
    expect(runtimeProtocolSchemas.listens.sceneUpdates.args.safeParse({ afterSequence: -1 }).success).toBe(false);
  });
});
