/**
 * The agent's grep and glob over the authority's Project Index (charter D13,
 * S12): count gates on a real indexed root, with the view wrapped only to tally
 * what it served.
 */
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { RootedFileSystem } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { handleGlobSearch, handleGrep } from '@taucad/chat/rpc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';

const projectRoute = '/projects/search';

/** Bytes a binary sniff rejects: NUL bytes from the first one. */
const binaryBytes = (size: number): Uint8Array<ArrayBuffer> => new Uint8Array(size).fill(0);

type Tally = { walks: number; reads: string[]; binaryBytesRead: number };

let service: WorkspaceFileService;
let rooted: RootedFileSystem;

const binaries = new Set(['models/part.step', 'models/mesh.glb']);

beforeEach(async () => {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:search' });
  const mountTable = new MountTable();
  mountTable.mount(projectRoute, provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:search' });
  service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
    policy: tauPathPolicy,
  });
  rooted = service.createRootedFileSystem(projectRoute);
  await rooted.writeFile('main.ts', 'export const marker = 1;\n');
  await rooted.writeFile('src/lib/util.ts', 'const a = 1;\n// marker here\n');
  await rooted.writeFile('src/lib/notes.md', 'no match\n');
  await rooted.writeFile('models/part.step', binaryBytes(4096));
  await rooted.writeFile('models/mesh.glb', binaryBytes(2048));
  /* An ignored directory: never indexed, so only a search that names it walks it. */
  await rooted.writeFile('node_modules/dep/index.ts', 'export const marker = 2;\n');
  /* Hidden from the agent: neither listed nor read. */
  await rooted.writeFile('.tau/project.json', '{"marker":true}\n');
});

afterEach(() => {
  service.dispose();
});

/**
 * The agent's RPC filesystem as a host builds it, over a counting view.
 *
 * @param tally - Receives each listing and read.
 * @returns The RPC filesystem.
 */
const agentFileSystem = (tally: Tally) => {
  const view = composeView({ filesystem: rooted }, { consumer: 'agent', policy: tauPathPolicy });
  const counted = new Proxy(view, {
    get: (target, property, receiver) => {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property === 'readdirWithStats' && typeof value === 'function') {
        return async (...parameters: unknown[]) => {
          tally.walks += 1;
          return (value as (...values: unknown[]) => Promise<unknown>).apply(target, parameters);
        };
      }
      if (property === 'readFile' && typeof value === 'function') {
        return async (path: string, ...rest: unknown[]) => {
          const bytes = await (value as (...values: unknown[]) => Promise<Uint8Array<ArrayBuffer>>).apply(target, [
            path,
            ...rest,
          ]);
          tally.reads.push(path);
          if (binaries.has(path)) {
            tally.binaryBytesRead += bytes.byteLength;
          }
          return bytes;
        };
      }
      return typeof value === 'function' ? (value as (...values: unknown[]) => unknown).bind(target) : value;
    },
  }) satisfies ComposedView;
  return createProviderRpcFileSystem({ provider: counted, mutations: new ResourceQueue() });
};

describe('index-backed agent search (S12)', () => {
  it('greps the project with no walk, no binary byte and no hidden or ignored path', async () => {
    const tally: Tally = { walks: 0, reads: [], binaryBytesRead: 0 };

    const result = await handleGrep({ pattern: 'marker', path: '' }, agentFileSystem(tally));

    expect(result).toMatchObject({ success: true, totalMatches: 2 });
    expect(result.success && result.matches.map((match) => match.file).sort()).toEqual(['main.ts', 'src/lib/util.ts']);
    expect(tally.walks).toBe(0);
    expect(tally.binaryBytesRead).toBe(0);
    expect(tally.reads.sort()).toEqual(['main.ts', 'src/lib/notes.md', 'src/lib/util.ts']);
  });

  it('skips a binary the index already knows without asking for its kind again', async () => {
    const fileSystem = agentFileSystem({ walks: 0, reads: [], binaryBytesRead: 0 });
    await handleGrep({ pattern: 'marker', path: '' }, fileSystem);
    const tally: Tally = { walks: 0, reads: [], binaryBytesRead: 0 };

    await handleGrep({ pattern: 'marker', path: 'models' }, agentFileSystem(tally));

    expect(tally).toEqual({ walks: 0, reads: [], binaryBytesRead: 0 });
  });

  it('greps a directory the index does not hold by walking it', async () => {
    const tally: Tally = { walks: 0, reads: [], binaryBytesRead: 0 };

    const result = await handleGrep({ pattern: 'marker', path: 'node_modules' }, agentFileSystem(tally));

    expect(result.success && result.matches.map((match) => match.file)).toEqual(['node_modules/dep/index.ts']);
    expect(tally.walks).toBeGreaterThan(0);
  });

  it('applies the grep glob before any read', async () => {
    const tally: Tally = { walks: 0, reads: [], binaryBytesRead: 0 };

    const result = await handleGrep({ pattern: 'marker', path: '', glob: '*.ts' }, agentFileSystem(tally));

    expect(result).toMatchObject({ success: true, totalMatches: 2 });
    expect(tally.reads.sort()).toEqual(['main.ts', 'src/lib/util.ts']);
  });

  it('globs the project from the index with no walk and no read', async () => {
    const tally: Tally = { walks: 0, reads: [], binaryBytesRead: 0 };

    const result = await handleGlobSearch({ pattern: '**/*.ts' }, agentFileSystem(tally));

    expect(result.success && [...result.files].sort()).toEqual(['main.ts', 'src/lib/util.ts']);
    expect(tally).toEqual({ walks: 0, reads: [], binaryBytesRead: 0 });
  });

  it('globs below a directory with project-relative paths', async () => {
    const result = await handleGlobSearch(
      { pattern: '*.md', path: 'src' },
      agentFileSystem({ walks: 0, reads: [], binaryBytesRead: 0 }),
    );

    expect(result.success && result.files).toEqual(['src/lib/notes.md']);
  });
});
