/**
 * Freshness conformance (R6/EQ8) — a long-lived client's answer equals a
 * freshly created client's answer after every mutation of the evaluated
 * closure, on every filesystem adapter.
 *
 * The differential oracle is deliberately blunt: a fresh client has no
 * volatile cache to be wrong about, so whatever it says is the filesystem's
 * own answer. Any retained entry that survives a mutation shows up here as an
 * inequality, whichever adapter or transport holds it.
 *
 * See `docs/research/agent-stale-kernel-result-elimination-blueprint.md` (I1–I4, I8).
 */

import { afterEach, describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, unlink, readFile, readdir, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { NativeStats } from '@taucad/types';

import { fromFileSystemBridge, fromFsLike } from '#filesystem/runtime-filesystem.js';
import { fromNodeFs } from '#filesystem/from-node-fs.js';
import type { FsLike, RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { createRuntimeClient } from '#client/runtime-client-core.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import { wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
// oxlint-disable-next-line no-restricted-imports -- Runtime-private fixture stays outside the package build graph.
import { createParameterDeclaration } from '../../test/support/kernel-worker.fixture.js';

const entryPath = 'main.scope';
const dependencyPath = 'dep.scope';
const decoder = new TextDecoder();

/** One kernel for every adapter: geometry is the entry plus whichever dependency currently exists. */
const freshnessKernel = defineKernel({
  id: 'freshness-conformance',
  name: 'Freshness conformance fixture',
  version: '1.0.0',
  extensions: ['scope'],
  exportFormats: { glb: { optionsSchema: z.object({}) } },
  async initialize() {
    return {};
  },
  async getDependencies(input, runtime) {
    const resolved = [input.entryPath];
    if (await runtime.filesystem.exists(dependencyPath)) {
      resolved.push(dependencyPath);
    }
    return { resolved, unresolved: resolved.includes(dependencyPath) ? [] : [dependencyPath] };
  },
  async getParameters() {
    return createParameterDeclaration();
  },
  async createGeometry(input, runtime) {
    const parts: string[] = [await runtime.filesystem.readFile(input.entryPath, 'utf8')];
    if (await runtime.filesystem.exists(dependencyPath)) {
      parts.push(await runtime.filesystem.readFile(dependencyPath, 'utf8'));
    }
    const label = parts.join('+');
    return {
      geometry: { format: 'gltf', content: new TextEncoder().encode(label) },
      nativeHandle: { label },
      issues: [],
    };
  },
  async exportGeometry(input) {
    return {
      success: true,
      data: [
        {
          name: 'model.glb',
          bytes: new TextEncoder().encode(`export:${String(input.nativeHandle.label)}`),
          mimeType: 'model/gltf-binary',
        },
      ],
      issues: [],
    };
  },
})();

const runtime = defineRuntime({ kernels: [freshnessKernel] });

/** The comparable shape of an evaluation: what the caller can act on. */
type Verdict = {
  readonly success: boolean;
  readonly hash?: string;
  readonly label?: string;
  readonly issues: readonly string[];
};

const openClient = (fileSystem: RuntimeFileSystem): ReturnType<typeof createRuntimeClient> =>
  createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });

const evaluateVerdict = async (client: ReturnType<typeof createRuntimeClient>): Promise<Verdict> => {
  const result = await client.evaluate({ source: { path: entryPath } });
  if (!result.success) {
    return { success: false, issues: result.issues.map(({ message }) => message) };
  }
  return {
    success: true,
    hash: result.data.hash,
    label: result.data.format === 'gltf' ? decoder.decode(result.data.content) : undefined,
    issues: result.issues.map(({ message }) => message),
  };
};

type Bed = {
  readonly fileSystem: RuntimeFileSystem;
  readonly write: (path: string, content: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly dispose: () => Promise<void>;
};

/** A single shared in-memory store: `create()` normally mints a private store per client. */
const sharedMemoryStore = (seed: Record<string, string>): RuntimeFileSystemBase => {
  const handle = _fromMemoryFsHandle(seed);
  if (handle.kind !== 'inline') {
    throw new Error('The memory handle must be inline.');
  }
  return handle.create();
};

const memoryBed = async (): Promise<Bed> => {
  const store = sharedMemoryStore({ [entryPath]: 'entry-v1', [dependencyPath]: 'dep-v1' });
  return {
    fileSystem: wrapAsRuntimeFileSystem({ kind: 'inline', create: () => store }),
    write: async (path, content) => store.writeFile(path, content),
    remove: async (path) => store.unlink(path),
    dispose: async () => undefined,
  };
};

const bridgeBed = async (): Promise<Bed> => {
  const store = sharedMemoryStore({ [entryPath]: 'entry-v1', [dependencyPath]: 'dep-v1' });
  return {
    fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(store)),
    write: async (path, content) => store.writeFile(path, content),
    remove: async (path) => store.unlink(path),
    dispose: async () => undefined,
  };
};

const createTemporaryProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-freshness-'));
  await writeFile(join(root, entryPath), 'entry-v1');
  await writeFile(join(root, dependencyPath), 'dep-v1');
  return root;
};

/** An `fs.promises`-shaped object confined to one directory, with no watch channel of its own. */
const confinedFsLike = (root: string): FsLike => ({
  promises: {
    readFile: (async (path: string, encoding?: 'utf8') =>
      encoding === 'utf8'
        ? readFile(join(root, path), 'utf8')
        : new Uint8Array(await readFile(join(root, path)))) as FsLike['promises']['readFile'],
    writeFile: async (path, data) => writeFile(join(root, path), data),
    mkdir: async (path, options) => mkdir(join(root, path), options),
    readdir: async (path) => readdir(join(root, path)),
    unlink: async (path) => unlink(join(root, path)),
    rmdir: async (path) => rm(join(root, path), { recursive: true }),
    rename: async (oldPath, newPath) => rename(join(root, oldPath), join(root, newPath)),
    stat: async (path) => (await stat(join(root, path))) as unknown as NativeStats,
    lstat: async (path) => (await stat(join(root, path))) as unknown as NativeStats,
  },
});

const nodeFsBed = async (watchable: boolean): Promise<Bed> => {
  const root = await createTemporaryProject();
  return {
    fileSystem: watchable ? fromNodeFs(root) : fromFsLike(confinedFsLike(root)),
    write: async (path, content) => writeFile(join(root, path), content),
    remove: async (path) => unlink(join(root, path)),
    dispose: async () => rm(root, { recursive: true, force: true }),
  };
};

const beds = [
  ['memory store (watchable)', memoryBed],
  ['filesystem bridge channel (desktop and daemon topology)', bridgeBed],
  ['fromFsLike (watcherless)', async () => nodeFsBed(false)],
  ['fromNodeFs (real fs.watch)', async () => nodeFsBed(true)],
] as const;

const openClients = new Set<ReturnType<typeof createRuntimeClient>>();
const openBeds = new Set<Bed>();

afterEach(async () => {
  await Promise.all([...openClients].map(async (client) => client.shutdown()));
  openClients.clear();
  await Promise.all([...openBeds].map(async (bed) => bed.dispose()));
  openBeds.clear();
});

describe.each(beds)('freshness conformance — %s', (_label, createBed) => {
  it('answers every mutation exactly as a freshly created client does', async () => {
    const bed = await createBed();
    openBeds.add(bed);
    const resident = openClient(bed.fileSystem);
    openClients.add(resident);

    const mutations: Array<readonly [string, () => Promise<void>]> = [
      ['no mutation', async () => undefined],
      ['entry edited', async () => bed.write(entryPath, 'entry-v2')],
      ['dependency edited', async () => bed.write(dependencyPath, 'dep-v2')],
      ['dependency deleted', async () => bed.remove(dependencyPath)],
      ['dependency recreated', async () => bed.write(dependencyPath, 'dep-v3')],
      ['entry edited again', async () => bed.write(entryPath, 'entry-v3')],
    ];

    /* The resident client answers first so that the mutation it must notice is the one
     * it already read through, which is the reported failure's exact shape. */
    await evaluateVerdict(resident);
    for (const [label, mutate] of mutations) {
      // oxlint-disable-next-line no-await-in-loop -- each mutation is compared before the next is applied.
      await mutate();
      // oxlint-disable-next-line no-await-in-loop -- sequential by construction.
      const residentVerdict = await evaluateVerdict(resident);
      const fresh = openClient(bed.fileSystem);
      openClients.add(fresh);
      // oxlint-disable-next-line no-await-in-loop -- sequential by construction.
      const freshVerdict = await evaluateVerdict(fresh);
      expect(residentVerdict, label).toEqual(freshVerdict);
    }
  });
});
