// @vitest-environment node
import { MessageChannel } from 'node:worker_threads';

import { digestContent, sceneDigest } from '@taucad/cache-core';
import type { ContentDigest } from '@taucad/cache-core';
import { SharedPool } from '@taucad/memory';
import { createChannelClient, wrapMessagePort } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import { describe, expect, it, vi } from 'vitest';

import type { KernelWorker } from '#framework/kernel-worker.js';
import { RuntimeWorkerClient } from '#framework/runtime-worker-client.js';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import { encodeGeometryAsOwnedCopy, encodeGeometryAsOwnedTransfer } from '#transport/_internal/owned-transfer-bytes.js';
import { createWorkerDispatcher, runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { GeometryEncoder } from '#transport/_internal/runtime-worker-dispatcher.js';
import { createWorkerHostBindings } from '#transport/_internal/worker-host-bindings.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';
import type { GeometryTransport, RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { ProgressiveSceneUpdate, SceneNodeId } from '#types/runtime-scene.types.js';

const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const rootNodeId = 'root' as SceneNodeId;

const createWorker = (): KernelWorker => {
  const worker = {
    initialize: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
    exportGeometry: vi.fn(),
    exportModel: vi.fn(),
    transcode: vi.fn(),
    snapshotSource: vi.fn(),
    readSceneSnapshot: vi.fn(() => ({ type: 'missing' })),
    listSceneBookmarks: vi.fn(() => []),
    handleOpenFile: vi.fn(),
    handleStageAndOpenFile: vi.fn(async () => undefined),
    handleUpdateParameters: vi.fn(),
    handleSetOptions: vi.fn(),
    handleWireAbort: vi.fn(),
    setProgressiveSceneRequested: vi.fn(),
    setTelemetrySend: vi.fn(),
    setDevtoolsTelemetryEnabled: vi.fn(),
    setCompiledWasmModules: vi.fn(),
    setSignalBuffer: vi.fn(),
    flushTelemetry: vi.fn(),
    permitComputePublication: vi.fn(),
    capabilitiesManifest: { registrations: [], routes: [], renderCapabilities: {} },
  };
  // oxlint-disable-next-line typescript/consistent-type-assertions -- focused protocol host double.
  return worker as unknown as KernelWorker;
};

type ResetOptions = {
  readonly renderId: string;
  readonly sequence: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly digest: ContentDigest;
};

const createReset = ({ renderId, sequence, bytes, digest }: ResetOptions): ProgressiveSceneUpdate => {
  return {
    type: 'reset',
    renderId,
    sequence,
    revision: sequence,
    sceneDigest: sceneDigest({ value: `sha256:${'2'.repeat(64)}` }),
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
          contentDigest: digest,
          mediaType: 'model/gltf-binary',
          byteLength: bytes.byteLength,
          geometry: { format: 'gltf', content: new Uint8Array(bytes) },
        },
      ],
    },
  };
};

type DeliveryFixture = {
  readonly encode: GeometryEncoder;
  readonly pool?: SharedPool;
  readonly acknowledge?: (key: string) => void;
};

const deliveryFixtures = (): ReadonlyArray<readonly [string, DeliveryFixture]> => {
  const poolBuffer = new SharedArrayBuffer(256 * 1024);
  const poolBindings = createWorkerHostBindings({ geometryPoolBuffer: poolBuffer });
  return [
    [
      'in-process pool',
      {
        encode: poolBindings.geometryDelivery.publish,
        pool: new SharedPool(poolBuffer),
        acknowledge: poolBindings.geometryDelivery.acknowledge,
      },
    ],
    ['worker transfer', { encode: encodeGeometryAsOwnedTransfer }],
    ['Electron/remote copy', { encode: encodeGeometryAsOwnedCopy }],
  ];
};

describe('progressive scene transport conformance', () => {
  it.each(deliveryFixtures())(
    '%s preserves order, bounds a slow consumer, reuses assets, and releases demand on unsubscribe',
    async (_name, delivery) => {
      const pair = new MessageChannel();
      const hostPort = wrapMessagePort<unknown>(pair.port1, { label: 'scene-conformance:host' });
      const clientPort = wrapMessagePort<unknown>(pair.port2, { label: 'scene-conformance:client' });
      hostPort.start?.();
      clientPort.start?.();
      const worker = createWorker();
      const acknowledge = vi.fn((key: string) => delivery.acknowledge?.(key));
      const server = createWorkerDispatcher(worker, hostPort, {
        encodeGeometry: delivery.encode,
        acknowledgeBinary: acknowledge,
      });
      const channel = createChannelClient<RuntimeProtocol>({
        port: clientPort,
        sessionKey: runtimeChannelSessionKey,
      });
      const materialisation = Promise.withResolvers<void>();
      let firstMaterialisation = true;
      const resolveGeometry = vi.fn(async (geometry: GeometryTransport): Promise<Geometry> => {
        if (firstMaterialisation) {
          firstMaterialisation = false;
          await materialisation.promise;
        }
        return materialiseGeometry(geometry, delivery.pool, (key) => {
          channel.notify('binaryMaterialised', { key });
        });
      });
      const transport: RuntimeTransportClient = {
        id: 'scene-conformance',
        closed: new Promise<never>(() => {
          // The harness owns the ports explicitly.
        }),
        reservePreview: () => ({}),
        renderTimeoutRecovery: { kind: 'unsupported' },
        describe: () => ({
          id: 'scene-conformance',
          wire: 'in-process',
          memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
          fileSystem: 'unbound',
        }),
        open: async () => ({ channel }),
        initialize: async () => channel.call('initialize', {}),
        resolveGeometry,
        close: async () => undefined,
      };
      const client = new RuntimeWorkerClient({ transport });
      const seen: number[] = [];
      const complete = Promise.withResolvers<void>();
      const updateCount = 17;

      try {
        await client.initialize();
        const { renderId } = client.admitPreview();
        const unsubscribe = client.onSceneUpdate((update) => {
          seen.push(update.sequence);
          if (seen.length === updateCount) {
            complete.resolve();
          }
        }, complete.reject);
        await vi.waitFor(() => {
          expect(worker.setProgressiveSceneRequested).toHaveBeenCalledWith(true);
        });

        const bytes = new Uint8Array([1, 2, 3]);
        const digest = await digestContent({ bytes });
        let finalPublicationSettled = false;
        const publications = Array.from({ length: updateCount }, async (_unused, index) => {
          await worker.onSceneUpdate?.(createReset({ renderId, sequence: index + 1, bytes, digest }));
          if (index === updateCount - 1) {
            finalPublicationSettled = true;
          }
        });
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        });
        expect(finalPublicationSettled).toBe(false);

        materialisation.resolve();
        await Promise.all(publications);
        await complete.promise;
        expect(seen).toEqual(Array.from({ length: updateCount }, (_unused, index) => index + 1));
        expect(resolveGeometry).toHaveBeenCalledOnce();

        unsubscribe();
        await vi.waitFor(() => {
          expect(worker.setProgressiveSceneRequested).toHaveBeenLastCalledWith(false);
        });
      } finally {
        materialisation.resolve();
        client.terminate();
        server.dispose('test');
        channel.close('test');
        pair.port1.close();
        pair.port2.close();
      }
    },
  );

  it('should drop a scene update published for a superseded render', async () => {
    const pair = new MessageChannel();
    const hostPort = wrapMessagePort<unknown>(pair.port1, { label: 'scene-supersession:host' });
    const clientPort = wrapMessagePort<unknown>(pair.port2, { label: 'scene-supersession:client' });
    hostPort.start?.();
    clientPort.start?.();
    const worker = createWorker();
    const server = createWorkerDispatcher(worker, hostPort, { encodeGeometry: encodeGeometryAsOwnedCopy });
    const channel = createChannelClient<RuntimeProtocol>({
      port: clientPort,
      sessionKey: runtimeChannelSessionKey,
    });
    const transport: RuntimeTransportClient = {
      id: 'scene-supersession',
      closed: new Promise<never>(() => {
        // The harness owns the ports explicitly.
      }),
      reservePreview: () => ({}),
      renderTimeoutRecovery: { kind: 'unsupported' },
      describe: () => ({
        id: 'scene-supersession',
        wire: 'in-process',
        memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
        fileSystem: 'unbound',
      }),
      open: async () => ({ channel }),
      initialize: async () => channel.call('initialize', {}),
      resolveGeometry: async (geometry: GeometryTransport) => materialiseGeometry(geometry, undefined),
      close: async () => undefined,
    };
    const client = new RuntimeWorkerClient({ transport });
    const seen: string[] = [];
    const delivered = Promise.withResolvers<void>();

    try {
      await client.initialize();
      const superseded = client.admitPreview();
      const unsubscribe = client.onSceneUpdate((update) => {
        seen.push(update.renderId);
        delivered.resolve();
      }, delivered.reject);
      await vi.waitFor(() => {
        expect(worker.setProgressiveSceneRequested).toHaveBeenCalledWith(true);
      });

      const bytes = new Uint8Array([1, 2, 3]);
      const digest = await digestContent({ bytes });
      // Admitting again replaces the visible request; the first render is now stale.
      const current = client.admitPreview();
      await worker.onSceneUpdate?.(createReset({ renderId: superseded.renderId, sequence: 1, bytes, digest }));
      await worker.onSceneUpdate?.(createReset({ renderId: current.renderId, sequence: 1, bytes, digest }));
      /*
       * Both updates travel the same ordered wire, so the newer one arriving proves the
       * stale one was already offered to the consumer — and refused.
       */
      await delivered.promise;

      expect(seen).toEqual([current.renderId]);
      unsubscribe();
    } finally {
      client.terminate();
      server.dispose('test');
      channel.close('test');
      pair.port1.close();
      pair.port2.close();
    }
  });
});
