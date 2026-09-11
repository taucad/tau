// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { digestContent, sceneDigest } from '@taucad/cache-core';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import { RuntimeWorkerClient } from '#framework/runtime-worker-client.js';
import { protocolVersion } from '#types/protocol-header.types.js';
import type {
  GeometryTransport,
  ProgressiveSceneUpdateTransport,
  RuntimeProtocol,
} from '#types/runtime-protocol.types.js';
import type { SceneNodeId } from '#types/runtime-scene.types.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';

const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const rootNodeId = 'root' as SceneNodeId;

const createFixture = async (updates: (renderId: string) => readonly ProgressiveSceneUpdateTransport[]) => {
  let renderId = '';
  const call = vi.fn();
  const channel = {
    ready: Promise.resolve(),
    hello: {
      payload: { server: 'kernel-runtime-worker', runtimeVersion: '0.0.0-test', protocolVersion },
    },
    onNotify: vi.fn(() => () => undefined),
    call,
    listen: vi.fn(async function* () {
      for (const update of updates(renderId)) {
        yield update;
      }
    }),
  } as unknown as Channel<RuntimeProtocol>;
  const resolveGeometry = vi.fn(async (geometry: GeometryTransport): Promise<Geometry> => {
    if (geometry.format !== 'gltf' || geometry.content.delivery !== 'inline') {
      throw new Error('Test fixture expected inline GLTF geometry.');
    }
    return { format: 'gltf', content: geometry.content.bytes, hash: geometry.hash };
  });
  const transport: RuntimeTransportClient = {
    id: 'scene-test',
    closed: new Promise<never>(() => {
      // Intentionally pending for the fixture lifetime.
    }),
    reservePreview: () => ({}),
    renderTimeoutRecovery: { kind: 'unsupported' },
    describe: () => ({
      id: 'scene-test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize: vi.fn(async () => ({ capabilities: { registrations: [], routes: [], renderCapabilities: {} } })),
    resolveGeometry,
    close: vi.fn(),
  };
  const client = new RuntimeWorkerClient({ transport });
  await client.initialize();
  renderId = client.admitPreview().renderId;
  return { client, resolveGeometry, call };
};

describe('RuntimeWorkerClient progressive scene assets', () => {
  it('materialises acknowledged evaluateModel geometry through the transport', async () => {
    const fixture = await createFixture(() => []);
    const transportGeometry: GeometryTransport = {
      format: 'gltf',
      content: { delivery: 'inline', bytes: new Uint8Array([4, 5, 6]) },
      hash: 'evaluation-hash',
    };
    fixture.call.mockResolvedValue({ success: true, data: transportGeometry, issues: [] });
    const controller = new AbortController();
    const request = { file: { path: '', filename: 'main.ts' }, parameters: {} };

    const result = await fixture.client.evaluateModel(request, controller.signal);

    expect(fixture.call).toHaveBeenCalledWith('evaluateModel', request, controller.signal);
    expect(fixture.resolveGeometry).toHaveBeenCalledWith(transportGeometry);
    expect(result).toEqual({
      success: true,
      data: { format: 'gltf', content: new Uint8Array([4, 5, 6]), hash: 'evaluation-hash' },
      issues: [],
    });
    fixture.client.terminate();
  });

  it('accepts a reconstructible reset keyframe after a sequence gap', async () => {
    const reset = (renderId: string, sequence: number, skippedBefore: number): ProgressiveSceneUpdateTransport => ({
      type: 'reset',
      renderId,
      sequence,
      revision: sequence,
      sceneDigest: sceneDigest({ value: `sha256:${sequence.toString(16).padStart(64, '0')}` }),
      skippedBefore,
      snapshot: {
        manifest: { schemaVersion: 1, rootNodeIds: [], nodes: {}, presentation: {} },
        assets: [],
      },
    });
    const fixture = await createFixture((renderId) => [reset(renderId, 1, 0), reset(renderId, 24, 23)]);
    const seen: number[] = [];
    const failed = vi.fn();
    const complete = Promise.withResolvers<void>();

    fixture.client.onSceneUpdate((update) => {
      seen.push(update.sequence);
      if (seen.length === 2) {
        complete.resolve();
      }
    }, failed);
    await complete.promise;

    expect(seen).toEqual([1, 24]);
    expect(failed).not.toHaveBeenCalled();
    fixture.client.terminate();
  });

  it('materialises one inline asset, resolves later references, and keeps cached bytes private', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const digest = await digestContent({ bytes });
    const fixture = await createFixture((renderId) => [
      {
        type: 'reset',
        renderId,
        sequence: 1,
        revision: 1,
        sceneDigest: sceneDigest({ value: digest }),
        skippedBefore: 0,
        snapshot: {
          manifest: {
            schemaVersion: 1,
            rootNodeIds: [rootNodeId],
            nodes: {
              root: {
                id: rootNodeId,
                childIds: [],
                geometry: { contentDigest: digest, mediaType: 'model/gltf-binary', byteLength: bytes.byteLength },
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
              byteLength: bytes.byteLength,
              geometry: {
                format: 'gltf',
                content: { delivery: 'inline', bytes },
                hash: digest,
              },
            },
          ],
        },
      },
      {
        type: 'delta',
        renderId,
        sequence: 2,
        baseRevision: 1,
        revision: 2,
        baseSceneDigest: sceneDigest({ value: digest }),
        sceneDigest: sceneDigest({ value: digest }),
        operations: [],
        assets: [
          {
            delivery: 'reference',
            contentDigest: digest,
            mediaType: 'model/gltf-binary',
            byteLength: bytes.byteLength,
          },
        ],
      },
    ]);
    const seen: Array<Uint8Array<ArrayBuffer>> = [];
    const complete = Promise.withResolvers<void>();

    fixture.client.onSceneUpdate((update) => {
      const asset =
        update.type === 'reset' ? update.snapshot.assets[0] : update.type === 'delta' ? update.assets[0] : undefined;
      if (asset?.geometry.format !== 'gltf') {
        return;
      }
      seen.push(asset.geometry.content);
      if (seen.length === 1) {
        asset.geometry.content[0] = 99;
      } else {
        complete.resolve();
      }
    }, complete.reject);
    await complete.promise;

    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen[0]).not.toBe(seen[1]);
    expect(fixture.resolveGeometry).toHaveBeenCalledOnce();
    fixture.client.terminate();
  });

  it('rejects an unknown content reference', async () => {
    const digest = await digestContent({ bytes: new Uint8Array([1]) });
    const fixture = await createFixture((renderId) => [
      {
        type: 'reset',
        renderId,
        sequence: 1,
        revision: 1,
        sceneDigest: sceneDigest({ value: digest }),
        skippedBefore: 0,
        snapshot: {
          manifest: { schemaVersion: 1, rootNodeIds: [], nodes: {}, presentation: {} },
          assets: [
            {
              delivery: 'reference',
              contentDigest: digest,
              mediaType: 'model/gltf-binary',
              byteLength: 1,
            },
          ],
        },
      },
    ]);
    const failed = Promise.withResolvers<unknown>();

    fixture.client.onSceneUpdate(() => undefined, failed.resolve);

    await expect(failed.promise).resolves.toMatchObject({
      message: `Unknown progressive scene asset reference ${digest}.`,
    });
    expect(fixture.resolveGeometry).not.toHaveBeenCalled();
    fixture.client.terminate();
  });

  it('rejects mismatched inline digests and referenced metadata', async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const digest = await digestContent({ bytes });
    const otherDigest = await digestContent({ bytes: new Uint8Array([7, 8, 9]) });
    const inlineFixture = await createFixture((renderId) => [
      {
        type: 'reset',
        renderId,
        sequence: 1,
        revision: 1,
        sceneDigest: sceneDigest({ value: digest }),
        skippedBefore: 0,
        snapshot: {
          manifest: { schemaVersion: 1, rootNodeIds: [], nodes: {}, presentation: {} },
          assets: [
            {
              delivery: 'inline',
              contentDigest: otherDigest,
              mediaType: 'model/gltf-binary',
              byteLength: bytes.byteLength,
              geometry: { format: 'gltf', content: { delivery: 'inline', bytes }, hash: otherDigest },
            },
          ],
        },
      },
    ]);
    const inlineFailed = Promise.withResolvers<unknown>();
    inlineFixture.client.onSceneUpdate(() => undefined, inlineFailed.resolve);
    await expect(inlineFailed.promise).resolves.toMatchObject({
      message: `Progressive scene asset integrity check failed for ${otherDigest}.`,
    });
    inlineFixture.client.terminate();

    const referenceFixture = await createFixture((renderId) => [
      {
        type: 'reset',
        renderId,
        sequence: 1,
        revision: 1,
        sceneDigest: sceneDigest({ value: digest }),
        skippedBefore: 0,
        snapshot: {
          manifest: { schemaVersion: 1, rootNodeIds: [], nodes: {}, presentation: {} },
          assets: [
            {
              delivery: 'inline',
              contentDigest: digest,
              mediaType: 'model/gltf-binary',
              byteLength: bytes.byteLength,
              geometry: { format: 'gltf', content: { delivery: 'inline', bytes }, hash: digest },
            },
          ],
        },
      },
      {
        type: 'delta',
        renderId,
        sequence: 2,
        baseRevision: 1,
        revision: 2,
        baseSceneDigest: sceneDigest({ value: digest }),
        sceneDigest: sceneDigest({ value: digest }),
        operations: [],
        assets: [
          {
            delivery: 'reference',
            contentDigest: digest,
            mediaType: 'model/gltf-binary',
            byteLength: bytes.byteLength + 1,
          },
        ],
      },
    ]);
    const referenceFailed = Promise.withResolvers<unknown>();
    referenceFixture.client.onSceneUpdate(() => undefined, referenceFailed.resolve);
    await expect(referenceFailed.promise).resolves.toMatchObject({
      message: `Progressive scene asset metadata mismatch for ${digest}.`,
    });
    referenceFixture.client.terminate();
  });
});
