/**
 * `hashFiles` passes down through the rooted view and the composed view to the
 * provider that holds the bytes, in one call; overlay entries and providers
 * without the call keep reading.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { composeView } from '#composed-view.js';
import type { ComposedViewOverlay } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

const encoder = new TextEncoder();
const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

/** A memory provider that digests on its own side, counting calls. */
const hashingProvider = async (files: Record<string, string>) => {
  const provider = new MemoryProvider();
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- fixture seeding is sequential.
    await provider.writeFile(path, content);
  }
  const hashFiles = vi.fn(async (paths: readonly string[]) =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => {
          try {
            return [
              path,
              createHash('sha256')
                .update(await provider.readFile(path))
                .digest('hex'),
            ] as const;
          } catch {
            return [path, 'missing'] as const;
          }
        }),
      ),
    ),
  );
  const readFile = vi.spyOn(provider, 'readFile');
  return { provider: Object.assign(provider, { hashFiles }), hashFiles, readFile };
};

const overlayFile = '.agents/skills/demo/SKILL.md';
const overlayContent = '---\nname: demo\n---\n';
const overlay = (): ComposedViewOverlay => ({
  root: '.agents/skills',
  source: 'system-skills',
  unit: (path) =>
    path.startsWith('.agents/skills/demo') ? { root: '.agents/skills/demo', identity: 'skill:demo@1' } : undefined,
  node: (path) =>
    path === overlayFile
      ? { type: 'file', size: encoder.encode(overlayContent).byteLength, contentKind: 'text', lineCount: 4 }
      : path === '.agents/skills/demo'
        ? { type: 'dir', children: ['SKILL.md'] }
        : undefined,
  read: async () => encoder.encode(overlayContent),
});

describe('composeView hashFiles', () => {
  it('asks the base once for project files and digests overlay entries itself', async () => {
    const { provider, hashFiles, readFile } = await hashingProvider({ 'main.ts': 'model', 'lib/a.ts': 'a' });
    const view = composeView(
      { filesystem: provider },
      { consumer: 'agent', policy: tauPathPolicy, overlays: [overlay()] },
    );
    readFile.mockClear();

    const digests = await view.hashFiles!(['main.ts', 'lib/a.ts', 'gone.ts', overlayFile]);

    expect(digests).toEqual({
      'main.ts': sha256('model'),
      'lib/a.ts': sha256('a'),
      'gone.ts': 'missing',
      [overlayFile]: sha256(overlayContent),
    });
    expect(hashFiles).toHaveBeenCalledOnce();
    expect(hashFiles.mock.calls[0]![0]).toEqual(['main.ts', 'lib/a.ts', 'gone.ts']);
  });

  it('refuses a hidden path as readFile does', async () => {
    const { provider, hashFiles } = await hashingProvider({ 'main.ts': 'model' });
    const view = composeView({ filesystem: provider }, { consumer: 'agent', policy: tauPathPolicy });

    await expect(view.hashFiles!(['main.ts', '.git/config'])).rejects.toMatchObject({ code: 'EPERM' });
    expect(hashFiles).not.toHaveBeenCalled();
  });

  it('offers no hashFiles over a base without one, so callers keep reading', () => {
    const view = composeView({ filesystem: new MemoryProvider() }, { consumer: 'agent', policy: tauPathPolicy });
    expect(view.hashFiles).toBeUndefined();
  });
});

describe('rooted view hashFiles', () => {
  const rootedOver = async (provider: MemoryProvider) => {
    const mountTable = new MountTable();
    mountTable.mount('/p', provider, {
      class: 'authored',
      backend: 'memory',
      storageRootKey: 'memory:hash-files',
      providerBasePath: 'gear',
    });
    const service = new WorkspaceFileService({
      providerRegistry: new ProviderRegistry(),
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable,
    });
    return { service, rooted: service.createRootedFileSystem('/p') };
  };

  it("hands the provider its own paths in one call and answers in the view's", async () => {
    const { provider, hashFiles, readFile } = await hashingProvider({ 'gear/main.ts': 'model', 'gear/tau.json': '{}' });
    const { service, rooted } = await rootedOver(provider);
    try {
      readFile.mockClear();
      const digests = await rooted.hashFiles!(['main.ts', 'tau.json', 'gone.ts']);

      expect(digests).toEqual({ 'main.ts': sha256('model'), 'tau.json': sha256('{}'), 'gone.ts': 'missing' });
      expect(hashFiles).toHaveBeenCalledOnce();
      expect(hashFiles.mock.calls[0]![0]).toEqual(['gear/main.ts', 'gear/tau.json', 'gear/gone.ts']);
    } finally {
      service.dispose();
    }
  });

  it('offers no hashFiles over a provider without one', async () => {
    const { service, rooted } = await rootedOver(new MemoryProvider());
    try {
      expect(rooted.hashFiles).toBeUndefined();
    } finally {
      service.dispose();
    }
  });
});
