// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB-backed authority fixture.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { preparePublishedPart } from '#framework/published-part-store.js';
import {
  publishAuthoredAssemblyRoot,
  publishPartsRoot,
  readPinnedPublishedAssemblyRoot,
} from '#framework/published-parts-root.js';
import { emptyGlb } from '#framework/published-part-test-fixture.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import { digestContent } from '@taucad/cache-core';
import type { PublishedPartAsset, PublishedPartRecord } from '#types/runtime-assembly.types.js';

const disposers: Array<() => void> = [];
let sequence = 0;

const sharedClients = async () => {
  const registry = new ProviderRegistry({ databasePrefix: `published-parts-${sequence++}` });
  const scope = { backend: 'indexeddb' } as const;
  const provider = await registry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, {
    class: 'authored',
    backend: 'indexeddb',
    storageRootKey: registry.resolveStorageRootKey(scope),
  });
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  const rooted = service.createRootedFileSystem('/');
  const leftBridge = createFileSystemBridgePort(rooted);
  const rightBridge = createFileSystemBridgePort(rooted);
  const left = createRuntimeFileSystem(await createWorkerFileSystemProxy(leftBridge.port));
  const right = createRuntimeFileSystem(await createWorkerFileSystemProxy(rightBridge.port));
  disposers.push(() => {
    leftBridge.dispose();
    rightBridge.dispose();
    service.dispose();
  });
  return { left, right };
};

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  vi.restoreAllMocks();
});

describe('host-shared checked published-parts root groundwork', () => {
  it('rejects a pinned root after its mutable path is overwritten, even at equal byte length', async () => {
    const { left, right } = await sharedClients();
    const sourcePath = 'parts/screw.py';
    const prepared = await preparePublishedPart({
      filesystem: left,
      directory: 'published',
      source: {
        entry: sourcePath,
        files: { [sourcePath]: await digestContent({ bytes: new TextEncoder().encode('screw') }) },
      },
      glb: emptyGlb(),
    });
    const outcome = await publishPartsRoot(left, {
      path: 'published/assembly-root.json',
      parts: { screw: prepared.reference },
    });
    expect(outcome.status).toBe('published');
    if (outcome.status !== 'published') {
      return;
    }
    await expect(readPinnedPublishedAssemblyRoot(right, outcome.root)).resolves.toMatchObject({ generation: 1 });
    const previous = await right.readFile(outcome.root.path, 'utf8');
    const changed = previous.replace('"generation":1', '"generation":2');
    expect(changed).not.toBe(previous);
    expect(changed.length).toBe(previous.length);
    await right.writeFile(outcome.root.path, changed);
    await expect(readPinnedPublishedAssemblyRoot(left, outcome.root)).rejects.toThrow(/pinned digest and length/u);
  });

  it('admits immutable content over a bridge and allows only one concurrent root generation', async () => {
    const { left, right } = await sharedClients();
    expect(left.writeFileChecked).toBeDefined();
    expect(right.writeFileChecked).toBeDefined();
    const sourcePath = 'parts/screw.py';
    const prepared = await preparePublishedPart({
      filesystem: left,
      directory: 'published',
      source: {
        entry: sourcePath,
        files: { [sourcePath]: await digestContent({ bytes: new TextEncoder().encode('screw') }) },
      },
      glb: emptyGlb(),
    });
    const boltPath = 'parts/bolt.py';
    const bolt = await preparePublishedPart({
      filesystem: right,
      directory: 'published',
      source: {
        entry: boltPath,
        files: { [boltPath]: await digestContent({ bytes: new TextEncoder().encode('bolt') }) },
      },
      glb: emptyGlb(),
    });
    const input = { path: 'published/assembly-root.json', parts: { screw: prepared.reference } };
    const competing = { path: input.path, parts: { bolt: bolt.reference } };
    const [first, second] = await Promise.all([publishPartsRoot(left, input), publishPartsRoot(right, competing)]);
    expect([first.status, second.status].sort()).toEqual(['published', 'superseded']);
    const root = JSON.parse(await left.readFile(input.path, 'utf8')) as {
      generation: number;
      parts: Record<string, unknown>;
    };
    expect(root.generation).toBe(1);
    expect(root.parts).toEqual(first.status === 'published' ? input.parts : competing.parts);
    const next = await publishPartsRoot(right, input);
    expect(next).toMatchObject({ status: 'published', generation: 2 });
  });

  it('retains the previous root when new closure admission or caller cancellation fails', async () => {
    const { left, right } = await sharedClients();
    const sourcePath = 'parts/screw.py';
    const prepared = await preparePublishedPart({
      filesystem: left,
      directory: 'published',
      source: {
        entry: sourcePath,
        files: { [sourcePath]: await digestContent({ bytes: new TextEncoder().encode('screw') }) },
      },
      glb: emptyGlb(),
    });
    const path = 'published/assembly-root.json';
    await publishPartsRoot(left, { path, parts: { screw: prepared.reference } });
    const previous = await left.readFile(path);
    await expect(
      publishPartsRoot(right, {
        path,
        parts: {
          screw: prepared.reference,
          invalid: { ...prepared.reference, digest: `sha256:${'f'.repeat(64)}` as typeof prepared.reference.digest },
        },
      }),
    ).rejects.toThrow(/pinned digest/u);
    expect(await left.readFile(path)).toEqual(previous);
    await expect(
      publishPartsRoot(right, {
        path,
        parts: { screw: prepared.reference },
        occurrences: [
          {
            id: 'placed',
            part: 'screw',
            variant: 'missing',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          },
        ],
      }),
    ).rejects.toThrow(/unknown variant/u);
    expect(await left.readFile(path)).toEqual(previous);
    const cancelled = new AbortController();
    const cancelledCall = publishPartsRoot(right, { path, parts: { screw: prepared.reference } }, cancelled.signal);
    cancelled.abort(new Error('caller cancelled'));
    await expect(cancelledCall).rejects.toThrow('caller cancelled');
    expect(await left.readFile(path)).toEqual(previous);
    await expect(publishPartsRoot(left, { path, parts: { screw: prepared.reference } })).resolves.toMatchObject({
      status: 'published',
      generation: 2,
    });
    expect(await left.readFile(prepared.record.variants['default']!.glb.path)).toEqual(emptyGlb());
  });

  it('runs the shared display admission before advancing an authored root', async () => {
    const { left } = await sharedClients();
    const entry = 'parts/display.py';
    const prepared = await preparePublishedPart({
      filesystem: left,
      directory: 'published',
      source: {
        entry,
        files: { [entry]: await digestContent({ bytes: new TextEncoder().encode('display') }) },
      },
      glb: emptyGlb(),
    });
    const path = 'published/display-root.json';
    expect(await publishPartsRoot(left, { path, parts: { display: prepared.reference } })).toMatchObject({
      status: 'published',
      generation: 1,
    });
    const previous = await left.readFile(path);
    await left.writeFile(
      'authored-display.json',
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: { display: { publishedPart: prepared.reference } },
          occurrences: [],
        }),
      ),
    );
    const admission = vi.fn(
      async (input: {
        records: Readonly<Record<string, PublishedPartRecord>>;
        readAsset: (part: string, asset: PublishedPartAsset) => Promise<Uint8Array<ArrayBuffer>>;
      }) => {
        const asset = input.records['display']!.variants['default']!.glb;
        expect(await input.readAsset('display', asset)).toEqual(emptyGlb());
        throw new Error('display cannot be projected');
      },
    );
    await expect(
      publishAuthoredAssemblyRoot(
        left,
        { authoredPath: 'authored-display.json', publicationPath: path },
        { produce: vi.fn(), admitDisplay: admission },
      ),
    ).resolves.toMatchObject({
      outcome: {
        status: 'invalid',
        issues: [{ code: 'SCENE_DISPLAY_INVALID', message: 'display cannot be projected' }],
      },
    });
    expect(admission).toHaveBeenCalledOnce();
    expect(await left.readFile(path)).toEqual(previous);
  });

  it('refuses a host without a display projector before producer work or root mutation', async () => {
    const { left } = await sharedClients();
    const path = 'published/root.json';
    await left.writeFile(
      'authored.json',
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: { fresh: { source: { path: 'parts/fresh.py' } } },
          occurrences: [],
        }),
      ),
    );
    const produce = vi.fn();
    await expect(
      publishAuthoredAssemblyRoot(
        left,
        {
          authoredPath: 'authored.json',
          publicationPath: path,
        },
        { produce },
      ),
    ).rejects.toThrow('Assembly display admission is unavailable');
    expect(produce).not.toHaveBeenCalled();
    await expect(left.readFile(path)).rejects.toThrow();
  });

  it('requires a checked authority for the mutable root', async () => {
    const { left } = await sharedClients();
    const unchecked = { ...left, writeFileChecked: undefined };
    await expect(publishPartsRoot(unchecked, { path: 'published/root.json', parts: {} })).rejects.toThrow(
      /Checked publication authority/u,
    );
  });

  it('retains an adversarial authored part key through checked root serialization', async () => {
    const { left } = await sharedClients();
    const entry = 'parts/key.py';
    const prepared = await preparePublishedPart({
      filesystem: left,
      directory: 'published',
      source: { entry, files: { [entry]: await digestContent({ bytes: new TextEncoder().encode('key') }) } },
      glb: emptyGlb(),
    });
    const parts = Object.fromEntries([['__proto__', prepared.reference]]);
    const path = 'published/key-root.json';
    expect(
      await publishPartsRoot(left, {
        path,
        parts,
        occurrences: [
          {
            id: 'special',
            part: '__proto__',
            variant: 'default',
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          },
        ],
      }),
    ).toMatchObject({ status: 'published', generation: 1 });
    const stored = JSON.parse(await left.readFile(path, 'utf8')) as { parts: Record<string, unknown> };
    expect(Object.hasOwn(stored.parts, '__proto__')).toBe(true);
  });

  it('fences authored producer work against another client and reuses a pinned part without production', async () => {
    const { left, right } = await sharedClients();
    const oldEntry = 'parts/old.py';
    const old = await preparePublishedPart({
      filesystem: left,
      directory: 'published',
      source: {
        entry: oldEntry,
        files: { [oldEntry]: await digestContent({ bytes: new TextEncoder().encode('old') }) },
      },
      glb: emptyGlb(),
    });
    const path = 'published/root.json';
    await publishPartsRoot(left, { path, parts: { old: old.reference } });
    const newEntry = 'parts/new.py';
    await left.writeFile(
      'authored.json',
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: { fresh: { source: { path: newEntry } } },
          occurrences: [
            {
              id: 'placed',
              part: 'fresh',
              transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            },
          ],
        }),
      ),
    );
    let releaseProducer: (() => void) | undefined;
    const producerGate = new Promise<void>((resolve) => {
      releaseProducer = resolve;
    });
    let signalEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const pending = publishAuthoredAssemblyRoot(
      left,
      { authoredPath: 'authored.json', publicationPath: path },
      {
        produce: async () => {
          signalEntered?.();
          await producerGate;
          return preparePublishedPart({
            filesystem: left,
            directory: 'published',
            source: {
              entry: newEntry,
              files: { [newEntry]: await digestContent({ bytes: new TextEncoder().encode('new') }) },
            },
            glb: emptyGlb(),
          });
        },
        admitDisplay: async () => undefined,
      },
    );
    await entered;
    expect(await publishPartsRoot(right, { path, parts: { old: old.reference } })).toMatchObject({
      status: 'published',
      generation: 2,
    });
    const winningRoot = await right.readFile(path);
    releaseProducer?.();
    const stale = await pending;
    expect(stale.outcome.status).toBe('superseded');
    expect(await left.readFile(path)).toEqual(winningRoot);

    await left.writeFile(
      'pinned.json',
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: { old: { publishedPart: old.reference } },
          occurrences: [],
        }),
      ),
    );
    const producer = vi.fn();
    const reused = await publishAuthoredAssemblyRoot(
      left,
      {
        authoredPath: 'pinned.json',
        publicationPath: path,
      },
      { produce: producer, admitDisplay: async () => undefined },
    );
    expect(producer).not.toHaveBeenCalled();
    expect(reused).toMatchObject({
      outcome: { status: 'published', generation: 3 },
      partRecords: { old: old.reference },
    });
  });
});
