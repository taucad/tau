// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import type {
  ProgressiveSceneUpdate,
  ReadSceneSnapshotResult,
  ResolvedSceneAsset,
  RuntimeReadSceneSnapshotInput,
  SceneNodeId,
} from '@taucad/runtime';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { cadMachine, selectCanSaveSelectedSceneStage } from '#machines/cad.machine.js';
import type { CadContext } from '#machines/cad.machine.js';
import { graphicsMachine, selectProgressiveSceneSnapshot } from '#machines/graphics.machine.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';

type SceneDigest = Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>['sceneDigest'];
type ContentDigest = ResolvedSceneAsset['contentDigest'];
const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const reset = (renderId: string, sequence: number, byteLength = 0): ProgressiveSceneUpdate => ({
  type: 'reset',
  renderId,
  sequence,
  revision: sequence,
  sceneDigest: `scene-${renderId}-${sequence}` as SceneDigest,
  skippedBefore: 0,
  snapshot: {
    manifest: {
      schemaVersion: 1,
      rootNodeIds: ['root' as SceneNodeId],
      nodes: {
        root: { id: 'root' as SceneNodeId, childIds: [], transform, visible: true },
      },
      presentation: {},
    },
    assets:
      byteLength === 0
        ? []
        : [
            {
              contentDigest: `asset-${sequence}` as ContentDigest,
              mediaType: 'model/gltf-binary',
              byteLength,
              geometry: { format: 'gltf', content: new Uint8Array([sequence]) },
            },
          ],
  },
});

const portableReset = (renderId: string, sequence: number): ProgressiveSceneUpdate => {
  const update = reset(renderId, sequence, 1);
  if (update.type !== 'reset') {
    throw new TypeError('Expected reset fixture');
  }
  const asset = update.snapshot.assets[0]!;
  return {
    ...update,
    snapshot: {
      ...update.snapshot,
      manifest: {
        ...update.snapshot.manifest,
        nodes: {
          root: {
            ...update.snapshot.manifest.nodes['root']!,
            geometry: {
              contentDigest: asset.contentDigest,
              mediaType: asset.mediaType,
              byteLength: asset.byteLength,
            },
          },
        },
      },
    },
  };
};

const createCadActor = (
  client = createMockRuntimeClient<typeof runtime>(),
  fileManagerRef?: NonNullable<CadContext['fileManagerRef']>,
) => {
  const cleanups: Array<() => void> = [];
  const connection = { type: 'kernelConnected', client, cleanups } as const;
  const machine = cadMachine.provide({
    actors: {
      connectKernelActor: fromSafeAsync(async () => connection),
    },
  });
  const kernelOptionsFactory: LazyKernelOptionsFactory = async () => () => {
    throw new Error('The provided connection actor bypasses kernel options');
  };
  return createActor(machine, {
    input: {
      shouldInitializeKernelOnStart: false,
      kernelOptionsFactory,
      fileSystemRoot: '/projects/test',
      fileManagerRef,
    },
  });
};

const createFileManagerProbe = () => {
  const canCreate = vi.fn();
  const write = vi.fn().mockResolvedValue(undefined);
  const createDirectory = vi.fn().mockResolvedValue(undefined);
  const contentService = { canCreate, write, createDirectory };
  const fileManagerRef = {
    getSnapshot: () => ({
      matches: (state: string) => state === 'ready',
      context: { contentService },
    }),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as unknown as NonNullable<CadContext['fileManagerRef']>;
  return { canCreate, write, createDirectory, fileManagerRef };
};

describe('cad progressive scene ownership', () => {
  let actor: ReturnType<typeof createCadActor>;

  beforeEach(async () => {
    actor = createCadActor();
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
  });

  afterEach(() => actor.stop());

  it('owns live-follow and scrub transitions', () => {
    actor.send({ type: 'sceneUpdate', update: reset('render-a', 0) });
    actor.send({ type: 'sceneUpdate', update: reset('render-a', 1) });
    actor.send({ type: 'selectSceneSequence', sequence: 0 });

    expect(actor.getSnapshot().context.sceneTimeline.selectedSequence).toBe(0);
    expect(actor.getSnapshot().context.sceneTimeline.followLive).toBe(false);

    actor.send({ type: 'followLiveScene' });
    expect(actor.getSnapshot().context.sceneTimeline.selectedSequence).toBe(1);
    expect(actor.getSnapshot().context.sceneTimeline.followLive).toBe(true);
  });

  it('marks terminal success complete without replacing authoritative geometry', () => {
    actor.send({ type: 'sceneUpdate', update: reset('render-a', 0) });
    actor.send({
      type: 'geometryComputed',
      geometry: { format: 'gltf', content: new Uint8Array([1]), hash: 'final' },
      issues: [],
    });

    expect(actor.getSnapshot().context.sceneTimeline.streamState).toBe('complete');
    expect(actor.getSnapshot().context.geometry?.hash).toBe('final');
  });

  it('clears the previous timeline when a filesystem render starts and settles from cache without scene updates', () => {
    actor.send({ type: 'sceneUpdate', update: reset('render-a', 0) });
    actor.send({
      type: 'geometryComputed',
      geometry: { format: 'gltf', content: new Uint8Array([1]), hash: 'last-good' },
      issues: [],
    });

    actor.send({ type: 'stateChanged', state: 'buffering' });
    actor.send({ type: 'stateChanged', state: 'rendering' });
    expect(actor.getSnapshot().context.sceneTimeline.entries).toEqual([]);
    expect(actor.getSnapshot().context.geometry?.hash).toBe('last-good');

    actor.send({ type: 'sceneUpdate', update: reset('render-a', 1) });
    actor.send({
      type: 'geometryComputed',
      geometry: { format: 'gltf', content: new Uint8Array([2]), hash: 'cached' },
      issues: [],
    });
    actor.send({ type: 'stateChanged', state: 'idle' });
    expect(actor.getSnapshot().context.sceneTimeline.entries).toEqual([]);
    expect(actor.getSnapshot().context.geometry?.hash).toBe('cached');
  });

  it('marks progressive output failed while retaining the previous successful final', () => {
    expect(actor.getSnapshot().context.kernelClient).toBeDefined();
    actor.send({
      type: 'geometryComputed',
      geometry: { format: 'gltf', content: new Uint8Array([1]), hash: 'last-good' },
      issues: [],
    });
    actor.send({ type: 'sceneUpdate', update: reset('render-b', 0) });
    actor.send({ type: 'geometryFailed', issues: [] });

    expect(actor.getSnapshot().context.sceneTimeline.streamState).toBe('failed');
    expect(actor.getSnapshot().context.geometry?.hash).toBe('last-good');
  });

  it('closes a cancelled transient branch without changing final geometry', () => {
    actor.send({
      type: 'geometryComputed',
      geometry: { format: 'gltf', content: new Uint8Array([1]), hash: 'last-good' },
      issues: [],
    });
    actor.send({ type: 'sceneUpdate', update: reset('render-b', 0) });
    actor.send({ type: 'progressiveSceneCancelled' });

    expect(actor.getSnapshot().context.sceneTimeline.streamState).toBe('cancelled');
    expect(actor.getSnapshot().context.geometry?.hash).toBe('last-good');
  });

  it('restores one evicted frame from storage, keeps it selected, and resumes Live without rerendering', async () => {
    const client = createMockRuntimeClient<typeof runtime>();
    const restored = reset('render-a', 0, 3 * 1024 * 1024);
    if (restored.type !== 'reset') {
      throw new TypeError('Expected reset fixture');
    }
    const readSceneSnapshot = vi.fn(async (input: RuntimeReadSceneSnapshotInput): Promise<ReadSceneSnapshotResult> => {
      input.signal?.throwIfAborted();
      return { type: 'found', snapshot: restored.snapshot };
    });
    Object.defineProperty(client, 'readSceneSnapshot', { value: readSceneSnapshot });
    actor.stop();
    actor = createCadActor(client);
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));

    const graphics = createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
      input: {},
    });
    graphics.start();
    const syncProjection = (): void => {
      const timeline = actor.getSnapshot().context.sceneTimeline;
      graphics.send({
        type: 'syncProgressiveScene',
        updates: timeline.entries.flatMap((entry) => (entry.update ? [entry.update] : [])),
        selectedSequence: timeline.selectedSequence,
      });
    };

    actor.send({ type: 'sceneUpdate', update: restored });
    actor.send({
      type: 'sceneUpdate',
      update: {
        type: 'bookmark',
        renderId: 'render-a',
        sequence: 1,
        revision: 0,
        bookmark: {
          id: 'bookmark-a',
          label: 'Saved stage',
          source: 'explicit',
          sceneDigest: restored.sceneDigest,
          retained: true,
        },
      },
    });
    syncProjection();
    for (let sequence = 2; sequence <= 26; sequence += 1) {
      actor.send({ type: 'sceneUpdate', update: reset('render-a', sequence, 3 * 1024 * 1024) });
      syncProjection();
    }

    expect(actor.getSnapshot().context.sceneTimeline.entries.find((entry) => entry.sequence === 0)?.availability).toBe(
      'retained',
    );
    expect(graphics.getSnapshot().context.progressiveScene.frames.some((frame) => frame.sequence === 0)).toBe(false);

    actor.send({ type: 'selectSceneSequence', sequence: 0 });
    actor.send({ type: 'selectSceneSequence', sequence: 0 });
    syncProjection();
    await waitFor(actor, (snapshot) =>
      Boolean(snapshot.context.sceneTimeline.entries.find((entry) => entry.sequence === 0)?.update),
    );
    syncProjection();

    expect(readSceneSnapshot).toHaveBeenCalledTimes(1);
    expect(readSceneSnapshot.mock.calls[0]?.[0].bookmarkId).toBe('bookmark-a');
    expect(readSceneSnapshot.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(selectProgressiveSceneSnapshot(graphics.getSnapshot())?.manifest).toBe(restored.snapshot.manifest);

    actor.send({ type: 'selectSceneSequence', sequence: 0 });
    syncProjection();
    expect(readSceneSnapshot).toHaveBeenCalledTimes(1);

    actor.send({ type: 'followLiveScene' });
    syncProjection();
    expect(actor.getSnapshot().context.sceneTimeline.selectedSequence).toBe(26);
    expect(graphics.getSnapshot().context.progressiveScene.selectedSequence).toBe(26);
    expect(selectProgressiveSceneSnapshot(graphics.getSnapshot())).toBeDefined();
    expect(client.render).not.toHaveBeenCalled();
    expect(client.updateParameters).not.toHaveBeenCalled();

    graphics.stop();
  });

  it('saves one portable selected stage with collision-safe naming without invoking render or export', async () => {
    const client = createMockRuntimeClient<typeof runtime>();
    const fileManager = createFileManagerProbe();
    const collision = Object.assign(new Error('A file already exists'), {
      code: 'NAME_EXISTS',
      path: 'stages/main-saved-stage',
    });
    fileManager.canCreate.mockResolvedValueOnce(collision).mockResolvedValueOnce(true);
    actor.stop();
    actor = createCadActor(client, fileManager.fileManagerRef);
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    vi.mocked(client.render).mockClear();

    const update = portableReset('render-save', 0);
    actor.send({ type: 'sceneUpdate', update });
    if (update.type !== 'reset') {
      throw new TypeError('Expected reset fixture');
    }
    actor.send({
      type: 'sceneUpdate',
      update: {
        type: 'bookmark',
        renderId: update.renderId,
        sequence: 1,
        revision: update.revision,
        bookmark: {
          id: 'bookmark-save',
          label: 'Saved stage',
          source: 'explicit',
          sceneDigest: update.sceneDigest,
          retained: true,
        },
      },
    });
    actor.send({ type: 'saveSelectedSceneStage' });
    await waitFor(actor, (snapshot) => snapshot.context.sceneTimeline.artifactSave.status === 'saved');

    expect(fileManager.canCreate.mock.calls).toEqual([
      ['stages/main-saved-stage', 'directory'],
      ['stages/main-saved-stage-2', 'directory'],
    ]);
    expect(fileManager.write).toHaveBeenCalledWith(
      'stages/main-saved-stage-2/model.glb',
      update.snapshot.assets[0]?.geometry.content,
      'user',
    );
    expect(actor.getSnapshot().context.sceneTimeline.artifactSave).toEqual({
      status: 'saved',
      sequence: 0,
      path: 'stages/main-saved-stage-2/model.glb',
    });
    expect(client.render).not.toHaveBeenCalled();
    expect(client.export).not.toHaveBeenCalled();
  });

  it('never overwrites a portable stage when another save wins directory allocation', async () => {
    const client = createMockRuntimeClient<typeof runtime>();
    const fileManager = createFileManagerProbe();
    fileManager.canCreate.mockResolvedValue(true);
    fileManager.createDirectory
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Directory already exists'));
    actor.stop();
    actor = createCadActor(client, fileManager.fileManagerRef);
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'sceneUpdate', update: portableReset('portable-race', 0) });
    actor.send({ type: 'saveSelectedSceneStage' });
    await waitFor(actor, (snapshot) =>
      ['saved', 'failed'].includes(snapshot.context.sceneTimeline.artifactSave.status),
    );
    expect(actor.getSnapshot().context.sceneTimeline.artifactSave.status).toBe('failed');
    expect(fileManager.write).not.toHaveBeenCalled();
  });

  it('rejects a new-render save explicitly while the previous render is still writing', async () => {
    const pending = Promise.withResolvers<void>();
    const fileManager = createFileManagerProbe();
    fileManager.canCreate.mockResolvedValue(true);
    fileManager.write.mockReturnValue(pending.promise);
    actor.stop();
    actor = createCadActor(createMockRuntimeClient<typeof runtime>(), fileManager.fileManagerRef);
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'sceneUpdate', update: portableReset('old-render', 0) });
    actor.send({ type: 'saveSelectedSceneStage' });
    await vi.waitFor(() => {
      expect(fileManager.write).toHaveBeenCalledTimes(1);
    });
    actor.send({ type: 'sceneUpdate', update: portableReset('new-render', 0) });
    actor.send({ type: 'saveSelectedSceneStage' });
    expect(actor.getSnapshot().context.sceneTimeline.artifactSave).toMatchObject({
      status: 'failed',
      message: 'Another preview stage is still being saved. Try again when it finishes.',
    });
    pending.resolve();
    await pending.promise;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(actor.getSnapshot().context.sceneTimeline.artifactSave.status).toBe('failed');
  });

  it.each(['sceneStageSaved', 'sceneStageSaveFailed'] as const)(
    'ignores an old-render %s reply while a new render saves the same sequence',
    async (type) => {
      const pending = Promise.withResolvers<void>();
      const fileManager = createFileManagerProbe();
      fileManager.canCreate.mockResolvedValue(true);
      fileManager.write.mockReturnValue(pending.promise);
      actor.stop();
      actor = createCadActor(createMockRuntimeClient<typeof runtime>(), fileManager.fileManagerRef);
      actor.start();
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      actor.send({ type: 'sceneUpdate', update: portableReset('new-render', 0) });
      actor.send({ type: 'saveSelectedSceneStage' });
      await vi.waitFor(() => {
        expect(fileManager.write).toHaveBeenCalledTimes(1);
      });
      if (type === 'sceneStageSaved') {
        actor.send({ type, renderId: 'old-render', sequence: 0, path: 'old.glb' });
      } else {
        actor.send({ type, renderId: 'old-render', sequence: 0, message: 'Old failure' });
      }
      expect(actor.getSnapshot().context.sceneTimeline.artifactSave.status).toBe('saving');
      pending.resolve();
      await waitFor(actor, (snapshot) => snapshot.context.sceneTimeline.artifactSave.status === 'saved');
    },
  );

  it.each(['reset', 'delta'] as const)(
    'promotes a selected %s manifest and deduplicated reachable assets without rendering',
    async (kind) => {
      const client = createMockRuntimeClient<typeof runtime>();
      const fileManager = createFileManagerProbe();
      fileManager.canCreate
        .mockResolvedValueOnce(Object.assign(new Error('Exists'), { code: 'NAME_EXISTS' }))
        .mockResolvedValue(true);
      actor.stop();
      actor = createCadActor(client, fileManager.fileManagerRef);
      actor.start();
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      vi.mocked(client.render).mockClear();
      const initial = portableReset('promotion', 0);
      if (initial.type !== 'reset') {
        throw new Error('Expected reset');
      }
      const root = initial.snapshot.manifest.nodes['root']!;
      const manifest = {
        ...initial.snapshot.manifest,
        rootNodeIds: [root.id, 'second' as SceneNodeId],
        nodes: {
          root,
          second: {
            ...root,
            id: 'second' as SceneNodeId,
            visible: false,
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1] as const,
          },
        },
        presentation: { background: [0, 0, 0, 1] as const, fieldOfViewDegrees: 45 },
      };
      if (kind === 'reset') {
        actor.send({ type: 'sceneUpdate', update: { ...initial, snapshot: { ...initial.snapshot, manifest } } });
      } else {
        actor.send({ type: 'sceneUpdate', update: initial });
        actor.send({
          type: 'sceneUpdate',
          update: {
            type: 'delta',
            renderId: initial.renderId,
            sequence: 1,
            revision: 1,
            baseRevision: initial.revision,
            baseSceneDigest: initial.sceneDigest,
            sceneDigest: 'delta-scene' as SceneDigest,
            operations: [
              { type: 'upsert-node', node: manifest.nodes.second },
              { type: 'set-presentation', presentation: manifest.presentation },
            ],
            assets: [],
          },
        });
      }
      expect(selectCanSaveSelectedSceneStage(actor.getSnapshot())).toBe(true);
      actor.send({ type: 'saveSelectedSceneStage' });
      await waitFor(actor, (snapshot) => snapshot.context.sceneTimeline.artifactSave.status === 'saved');
      const base = `stages/main-stage-${kind === 'reset' ? '1' : '2'}-2`;
      expect(fileManager.createDirectory).toHaveBeenCalledWith(base);
      expect(fileManager.write.mock.calls).toEqual([
        [`${base}/asset-0.glb`, initial.snapshot.assets[0]!.geometry.content, 'user'],
        [`${base}/scene.json`, new TextEncoder().encode(JSON.stringify(manifest)), 'user'],
      ]);
      expect(actor.getSnapshot().context.sceneTimeline.artifactSave).toMatchObject({
        status: 'saved',
        path: `${base}/scene.json`,
      });
      expect(client.render).not.toHaveBeenCalled();
      expect(client.export).not.toHaveBeenCalled();
    },
  );

  it.each(['preflight', 'asset-write', 'directory-race'] as const)(
    'does not commit a stage manifest after a %s failure',
    async (failure) => {
      const fileManager = createFileManagerProbe();
      fileManager.canCreate.mockResolvedValue(true);
      const failed = new Error('Promotion failed');
      if (failure === 'preflight') {
        fileManager.canCreate.mockResolvedValue(
          Object.assign(failed, { code: 'READ_ONLY_MOUNT', path: 'stages/main-stage-1' }),
        );
      }
      if (failure === 'asset-write') {
        fileManager.write.mockRejectedValue(failed);
      }
      if (failure === 'directory-race') {
        fileManager.createDirectory.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failed);
      }
      actor.stop();
      actor = createCadActor(createMockRuntimeClient<typeof runtime>(), fileManager.fileManagerRef);
      actor.start();
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));
      const initial = portableReset('promotion-failure', 0);
      if (initial.type !== 'reset') {
        throw new Error('Expected reset');
      }
      actor.send({
        type: 'sceneUpdate',
        update: {
          ...initial,
          snapshot: {
            ...initial.snapshot,
            manifest: { ...initial.snapshot.manifest, presentation: { fieldOfViewDegrees: 45 } },
          },
        },
      });
      expect(selectCanSaveSelectedSceneStage(actor.getSnapshot())).toBe(true);
      actor.send({ type: 'saveSelectedSceneStage' });
      await waitFor(actor, (snapshot) => snapshot.context.sceneTimeline.artifactSave.status === 'failed');
      expect(fileManager.write.mock.calls.some(([path]) => String(path).endsWith('/scene.json'))).toBe(false);
      if (failure !== 'asset-write') {
        expect(fileManager.write).not.toHaveBeenCalled();
      }
    },
  );

  it('promotes a bookmarked delta after its reset has left the bounded timeline', async () => {
    const initial = portableReset('long-promotion', 0);
    if (initial.type !== 'reset') {
      throw new Error('Expected reset');
    }
    const client = createMockRuntimeClient<typeof runtime>();
    Object.defineProperty(client, 'readSceneSnapshot', {
      value: vi.fn().mockResolvedValue({ type: 'found', snapshot: initial.snapshot }),
    });
    const fileManager = createFileManagerProbe();
    fileManager.canCreate.mockResolvedValue(true);
    actor.stop();
    actor = createCadActor(client, fileManager.fileManagerRef);
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    vi.mocked(client.render).mockClear();
    actor.send({ type: 'sceneUpdate', update: initial });
    for (let sequence = 1; sequence <= 120; sequence += 1) {
      actor.send({
        type: 'sceneUpdate',
        update: {
          type: 'delta',
          renderId: initial.renderId,
          sequence,
          revision: sequence,
          baseRevision: sequence - 1,
          baseSceneDigest: initial.sceneDigest,
          sceneDigest: initial.sceneDigest,
          operations: [],
          assets: [],
        },
      });
    }
    actor.send({
      type: 'sceneUpdate',
      update: {
        type: 'bookmark',
        renderId: initial.renderId,
        sequence: 121,
        revision: 120,
        bookmark: { id: 'long-stage', source: 'explicit', sceneDigest: initial.sceneDigest, retained: true },
      },
    });
    expect(actor.getSnapshot().context.sceneTimeline.entries[0]?.sequence).toBe(1);
    expect(selectCanSaveSelectedSceneStage(actor.getSnapshot())).toBe(true);
    actor.send({ type: 'saveSelectedSceneStage' });
    await waitFor(actor, (snapshot) => snapshot.context.sceneTimeline.artifactSave.status === 'saved');
    expect(client.readSceneSnapshot).toHaveBeenCalledWith({ bookmarkId: 'long-stage' });
    expect(fileManager.write).toHaveBeenCalledWith(
      'stages/main-stage-121/model.glb',
      initial.snapshot.assets[0]!.geometry.content,
      'user',
    );
    expect(client.render).not.toHaveBeenCalled();
    expect(client.export).not.toHaveBeenCalled();
  });

  it('surfaces filesystem preflight failures without overwriting or invoking the kernel', async () => {
    const client = createMockRuntimeClient<typeof runtime>();
    const fileManager = createFileManagerProbe();
    const readOnly = Object.assign(new Error('The workspace is read-only'), {
      code: 'READ_ONLY_MOUNT',
      path: 'stages/main-stage-1',
    });
    fileManager.canCreate.mockResolvedValue(readOnly);
    actor.stop();
    actor = createCadActor(client, fileManager.fileManagerRef);
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    actor.send({ type: 'initializeModel', entryPath: 'main.cs' });
    await waitFor(actor, (snapshot) => snapshot.matches('idle'));
    vi.mocked(client.render).mockClear();

    actor.send({ type: 'sceneUpdate', update: portableReset('render-save', 0) });
    actor.send({ type: 'saveSelectedSceneStage' });
    await waitFor(actor, (snapshot) => snapshot.context.sceneTimeline.artifactSave.status === 'failed');

    expect(actor.getSnapshot().context.sceneTimeline.artifactSave).toEqual({
      status: 'failed',
      sequence: 0,
      message: "'stages/main-stage-1' is on a read-only mount and cannot be modified.",
    });
    expect(fileManager.canCreate).toHaveBeenCalledWith('stages/main-stage-1', 'directory');
    expect(fileManager.write).not.toHaveBeenCalled();
    expect(client.render).not.toHaveBeenCalled();
    expect(client.export).not.toHaveBeenCalled();
  });
});
