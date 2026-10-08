import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WatchEvent } from '@taucad/filesystem';
import { mock } from 'vitest-mock-extended';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { ListedDirectoryEntry } from '@taucad/fs-client/directory-listing';

const mockReadFile = vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>();
const mockListDirectory = vi.fn<(path: string) => Promise<ListedDirectoryEntry[]>>();
const mockUnsubscribe = vi.fn<() => void>();
const mockWatchDispose = vi.fn<() => void>();
let watchCallback: ((event: WatchEvent) => void) | undefined;
const settledCallbacks = new Map<string, () => void>();
const mockSubscribePath = vi.fn<(path: string, callback: () => void) => () => void>((path, callback) => {
  settledCallbacks.set(path, callback);
  return () => {
    settledCallbacks.delete(path);
    mockUnsubscribe();
  };
});

let treeSnapshot = new Map<string, { path: string; type: 'file'; size: number; mtimeMs: number }>();
let treeWrites = 0;

const mockTreeService = {
  closed: new Promise<void>(() => {
    /* This watch stays open until fixture disposal. */
  }),
  getTreeSnapshot: vi.fn(() => treeSnapshot),
  listDirectory: mockListDirectory,
  subscribePath: mockSubscribePath,
};

/** Publish a tree in which `path` was just written, as the tree service does after a file change. */
function writeTreeFile(path: string): void {
  treeWrites += 1;
  treeSnapshot = new Map(treeSnapshot).set(path, { path, type: 'file', size: treeWrites, mtimeMs: treeWrites });
  settledCallbacks.get(path.slice(0, path.lastIndexOf('/')))?.();
  if (path === '.agents' || path.startsWith('.agents/')) {
    watchCallback?.({ type: 'change', path });
  }
}

let actualContentService: FileContentService | undefined;

const mockContentObservations = new Map<string, ObservationService<FileContentResult>>();
const mockContentService = {
  observeContent: (path: string) => {
    let service = mockContentObservations.get(path);
    if (!service) {
      service = new ObservationService<FileContentResult>({
        resource: path,
        watch: () => ({ ready: Promise.resolve(), closed: mockTreeService.closed, dispose: () => undefined }),
        read: async () => {
          try {
            return { kind: 'text', content: await mockReadFile(path) };
          } catch {
            return { kind: 'orphaned' };
          }
        },
      });
      mockContentObservations.set(path, service);
    }
    return service;
  },
  watchReady: (_request: unknown, listener: (event: WatchEvent) => void) => {
    watchCallback = listener;
    return { ready: Promise.resolve(), closed: mockTreeService.closed, dispose: mockWatchDispose };
  },
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    readFile: mockReadFile,
    treeService: mockTreeService,
    contentService: actualContentService ?? mockContentService,
  }),
}));

const { skillMetadataToSlashCommand, usePromptSkillsCatalog, useSkillsCatalog, useSkillsCatalogState } =
  await import('#hooks/use-skills-catalog.js');
const { parseSkillFrontmatter } = await import('#hooks/use-context-payload.utils.js');
const { systemSkillsCatalog } = await import('#lib/system-skills-catalog.js');

const encoder = new TextEncoder();

function skillMarkdown(name: string, description: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`---\nname: ${name}\ndescription: '${description}'\n---\n\n# ${name}`);
}

function skillDirectoryRow(name: string): ListedDirectoryEntry {
  return { name, path: `.agents/skills/${name}`, isFolder: true, size: 0, mtimeMs: 0 };
}

/** Serve a single canonical skill whose SKILL.md description is `description`. */
function serveSingleSkill(name: string, description: string): void {
  mockListDirectory.mockImplementation(async (path) => (path === '.agents/skills' ? [skillDirectoryRow(name)] : []));
  mockReadFile.mockImplementation(async (path) => {
    if (path === `.agents/skills/${name}/SKILL.md`) {
      return skillMarkdown(name, description);
    }
    throw new Error(`not found: ${path}`);
  });
}

describe('skillMetadataToSlashCommand', () => {
  it('should expose create-skill as a system slash skill item', () => {
    const createSkill = systemSkillsCatalog.find((skill) => skill.slug === 'create-skill');
    if (!createSkill) {
      throw new Error('Expected system create-skill to be registered');
    }

    const metadata = parseSkillFrontmatter(createSkill.skillMarkdown, 'system:skills/create-skill/SKILL.md', {
      source: 'system',
      resourceUri: 'system:skills/create-skill/SKILL.md',
    });
    if (!metadata) {
      throw new Error('Expected create-skill frontmatter to parse');
    }

    expect(skillMetadataToSlashCommand(metadata)).toEqual(
      expect.objectContaining({
        id: 'create-skill',
        label: '/create-skill',
        title: 'Create Skill',
        group: 'Skills',
        source: 'system',
      }),
    );
  });
});

describe('usePromptSkillsCatalog', () => {
  beforeEach(() => {
    actualContentService = undefined;
    mockContentObservations.clear();
    vi.clearAllMocks();
    settledCallbacks.clear();
    treeSnapshot = new Map();
    mockListDirectory.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(new Error('not found'));
  });

  it.each(['edit', 'unlink'] as const)(
    'refreshes the catalog after physical SKILL.md %s with a retained directory and cached content',
    async (mutation) => {
      const path = '.agents/skills/cached/SKILL.md';
      const provider = new MemoryProvider();
      await provider.writeFile(path, skillMarkdown('cached', 'Original cached description'));
      const paths = new WorkspacePathResolver('/project');
      const proxy = mock<ComposedViewClient>();
      let heldRead: Promise<void> | undefined;
      let acknowledge: () => void = () => undefined;
      const ready = new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      proxy.readFile.mockImplementation(async (absolutePath) => {
        const relativePath = paths.toRelativePath(absolutePath);
        if (relativePath === undefined) {
          throw new Error(`Unexpected provider read outside project: ${absolutePath}`);
        }
        const bytes = await provider.readFile(relativePath);
        if (relativePath === path) {
          await heldRead;
        }
        return bytes;
      });
      const watches = new Set<(event: WatchEvent) => void>();
      const channel = new WorkerChangeChannel({
        transport: {
          listen: () => () => undefined,
          watchReady: (request, callback) => {
            watches.add(callback);
            return {
              ready: request.paths.includes('.agents') ? Promise.resolve() : ready,
              closed: mockTreeService.closed,
              unsubscribe: () => {
                watches.delete(callback);
              },
            };
          },
        },
      });
      const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
      actualContentService = content;
      mockReadFile.mockImplementation(async (file) => content.resolveBytes(file));
      mockListDirectory.mockImplementation(async (directory) =>
        directory === '.agents/skills' ? [skillDirectoryRow('cached')] : [],
      );
      const { result, unmount } = renderHook(() => useSkillsCatalogState());
      try {
        await waitFor(() => {
          expect(watches.size).toBeGreaterThan(1);
        });
        expect(proxy.readFile).not.toHaveBeenCalled();
        expect(result.current.status).not.toBe('ready');
        act(() => {
          acknowledge();
        });
        await waitFor(() => {
          expect(result.current.commands.find((skill) => skill.name === 'cached')?.description).toBe(
            'Original cached description',
          );
        });
        expect(await content.resolveBytes(path)).toEqual(skillMarkdown('cached', 'Original cached description'));
        const initialReads = proxy.readFile.mock.calls.length;
        let releaseRead: () => void = () => undefined;
        if (mutation === 'edit') {
          heldRead = new Promise<void>((resolve) => {
            releaseRead = resolve;
          });
        }
        await (mutation === 'edit'
          ? provider.writeFile(path, skillMarkdown('cached', 'Fresh authoritative description'))
          : provider.unlink(path));
        const retainedDirectories = await provider.readdirEntries('.agents/skills');
        expect(retainedDirectories.map((entry) => entry.name)).toContain('cached');
        act(() => {
          for (const callback of watches) {
            callback({ type: mutation === 'unlink' ? 'delete' : 'change', path });
          }
          settledCallbacks.get('.agents/skills')?.();
        });
        await waitFor(() => {
          expect(proxy.readFile.mock.calls.length).toBeGreaterThan(initialReads);
        });
        if (mutation === 'edit') {
          expect(result.current.status).not.toBe('ready');
          expect(result.current.commands.find((skill) => skill.name === 'cached')?.description).toBe(
            'Original cached description',
          );
          await act(async () => {
            releaseRead();
          });
        }
        await waitFor(() => {
          expect(result.current.status).toBe('ready');
          expect(result.current.commands.find((skill) => skill.name === 'cached')?.description).toBe(
            mutation === 'edit' ? 'Fresh authoritative description' : undefined,
          );
        });
        expect(proxy.readFile.mock.calls.length).toBeGreaterThan(initialReads);
      } finally {
        unmount();
        content.dispose();
        channel.dispose();
        actualContentService = undefined;
      }
    },
  );

  it('marks an already-ready shared content dependency unhealthy when only its exact watch closes', async () => {
    const path = '.agents/skills/alpha/SKILL.md';
    const provider = new MemoryProvider();
    await provider.writeFile(path, skillMarkdown('alpha', 'Shared ready authority'));
    const proxy = mock<ComposedViewClient>();
    const paths = new WorkspacePathResolver('/project');
    proxy.readFile.mockImplementation(async (absolute) => {
      const relative = paths.toRelativePath(absolute);
      if (relative === undefined) {
        throw new Error('Unexpected project read');
      }
      return provider.readFile(relative);
    });
    const exactClosed = Promise.withResolvers<void>();
    const channel = new WorkerChangeChannel({
      transport: {
        listen: () => () => undefined,
        watchReady: (request) => ({
          ready: Promise.resolve(),
          closed: request.paths.includes(path) ? exactClosed.promise : mockTreeService.closed,
          unsubscribe: () => undefined,
        }),
      },
    });
    const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
    const shared = content.observeContent(path).acquire();
    let unmount: (() => void) | undefined;
    try {
      await waitFor(() => {
        expect(shared.getSnapshot().status).toBe('ready');
      });
      expect(proxy.readFile.mock.calls.filter(([file]) => file === `/project/${path}`)).toHaveLength(1);
      actualContentService = content;
      serveSingleSkill('alpha', 'Unused generic reader');
      const current = renderHook(() => useSkillsCatalogState());
      unmount = current.unmount;
      await waitFor(() => {
        expect(current.result.current.status).toBe('ready');
        expect(current.result.current.commands.find((skill) => skill.name === 'alpha')?.description).toBe(
          'Shared ready authority',
        );
      });
      expect(proxy.readFile.mock.calls.filter(([file]) => file === `/project/${path}`)).toHaveLength(1);
      expect(mockListDirectory.mock.calls.filter(([directory]) => directory === '.agents/skills')).toHaveLength(1);
      await act(async () => {
        exactClosed.resolve();
      });
      await waitFor(() => {
        expect(current.result.current.status).toBe('error');
      });
      expect(shared.getSnapshot().status).toBe('closed');
    } finally {
      unmount?.();
      shared.release();
      content.dispose();
      channel.dispose();
      actualContentService = undefined;
    }
  });

  it('keeps failed exact content registration unhealthy through held Retry and releases retired callbacks', async () => {
    const path = '.agents/skills/alpha/SKILL.md';
    const provider = new MemoryProvider();
    await provider.writeFile(path, skillMarkdown('alpha', 'Recovered authority'));
    const proxy = mock<ComposedViewClient>();
    const paths = new WorkspacePathResolver('/project');
    proxy.readFile.mockImplementation(async (absolute) => {
      const relative = paths.toRelativePath(absolute);
      if (relative === undefined) {
        throw new Error('Unexpected project read');
      }
      return provider.readFile(relative);
    });
    let acknowledge: () => void = () => undefined;
    const retryReady = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    let fail = true;
    const active = new Set<(event: WatchEvent) => void>();
    const retired: Array<(event: WatchEvent) => void> = [];
    const channel = new WorkerChangeChannel({
      transport: {
        listen: () => () => undefined,
        watchReady: (request, callback) => {
          active.add(callback);
          const exact = !request.paths.includes('.agents');
          return {
            ready: exact
              ? fail
                ? Promise.reject(new Error('Exact registration refused'))
                : retryReady
              : Promise.resolve(),
            closed: mockTreeService.closed,
            unsubscribe: () => {
              active.delete(callback);
              retired.push(callback);
            },
          };
        },
      },
    });
    const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
    actualContentService = content;
    serveSingleSkill('alpha', 'Unused generic reader');
    const mounted = renderHook(() => useSkillsCatalogState());
    try {
      await waitFor(() => {
        expect(mounted.result.current.status).toBe('error');
      });
      expect(mounted.result.current.commands.find((skill) => skill.name === 'alpha')).toBeUndefined();
      expect(proxy.readFile).not.toHaveBeenCalled();
      fail = false;
      act(() => {
        mounted.result.current.retry();
      });
      await waitFor(() => {
        expect(mounted.result.current.status).toBe('pending');
      });
      expect(proxy.readFile).not.toHaveBeenCalled();
      await act(async () => {
        acknowledge();
      });
      await waitFor(() => {
        expect(mounted.result.current.status).toBe('ready');
        expect(mounted.result.current.commands.find((skill) => skill.name === 'alpha')?.description).toBe(
          'Recovered authority',
        );
      });
      mounted.unmount();
      expect(active.size).toBe(0);
      const oldCallbacks = [...retired];
      const replacement = renderHook(() => useSkillsCatalogState());
      try {
        await waitFor(() => {
          expect(replacement.result.current.status).toBe('ready');
          expect(replacement.result.current.commands.find((skill) => skill.name === 'alpha')?.description).toBe(
            'Recovered authority',
          );
        });
        const reads = proxy.readFile.mock.calls.length;
        act(() => {
          for (const callback of oldCallbacks) {
            callback({ type: 'reset' });
          }
        });
        await act(async () => {
          await Promise.resolve();
        });
        expect(proxy.readFile).toHaveBeenCalledTimes(reads);
        expect(replacement.result.current.status).toBe('ready');
      } finally {
        replacement.unmount();
      }
      expect(active.size).toBe(0);
    } finally {
      mounted.unmount();
      content.dispose();
      channel.dispose();
      actualContentService = undefined;
    }
  });

  it('refreshes equal-metadata skill bytes and reset without rerendering equal values', async () => {
    serveSingleSkill('alpha', 'Alpha');
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSkillsCatalog();
    });
    await waitFor(() => {
      expect(result.current.find((skill) => skill.name === 'alpha')?.description).toBe('Alpha');
    });
    const initialRenders = renders;
    const initialReads = mockReadFile.mock.calls.length;
    act(() => {
      watchCallback?.({ type: 'change', path: '.agents/skills/alpha/SKILL.md' });
    });
    await waitFor(() => {
      expect(mockReadFile).toHaveBeenCalledTimes(initialReads + 1);
      expect(mockReadFile.mock.calls.filter(([path]) => path === '.agents/skills/alpha/SKILL.md')).toHaveLength(2);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(renders).toBe(initialRenders);
    serveSingleSkill('alpha', 'Bravo');
    act(() => {
      watchCallback?.({ type: 'change', path: '.agents/skills/alpha/SKILL.md' });
    });
    await waitFor(() => {
      expect(result.current.find((skill) => skill.name === 'alpha')?.description).toBe('Bravo');
    });
    serveSingleSkill('alpha', 'Delta');
    act(() => {
      watchCallback?.({ type: 'reset' });
    });
    await waitFor(() => {
      expect(result.current.find((skill) => skill.name === 'alpha')?.description).toBe('Delta');
    });
  });

  it('should converge from settled tree changes after raw discovery returned a stale listing', async () => {
    serveSingleSkill('alpha', 'Alpha');
    const hook = renderHook(() => useSkillsCatalog());
    await waitFor(() => {
      expect(hook.result.current.some((skill) => skill.name === 'alpha')).toBe(true);
    });
    // The exact raw watch may run before the tree owner has merged fresh directory rows.
    act(() => {
      watchCallback?.({ type: 'change', path: '.agents/skills/beta' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    serveSingleSkill('beta', 'Beta');
    act(() => {
      treeSnapshot = new Map<string, { path: string; type: 'file'; size: number; mtimeMs: number }>().set(
        '.agents/skills/beta/SKILL.md',
        {
          path: '.agents/skills/beta/SKILL.md',
          type: 'file',
          size: 1,
          mtimeMs: 1,
        },
      );
      settledCallbacks.get('.agents/skills')?.();
    });
    await waitFor(() => {
      expect(hook.result.current.some((skill) => skill.name === 'beta')).toBe(true);
    });
    const reads = mockReadFile.mock.calls.length;
    const scans = mockTreeService.getTreeSnapshot.mock.calls.length;
    act(() => {
      treeSnapshot = new Map(treeSnapshot).set('main.ts', { path: 'main.ts', type: 'file', size: 2, mtimeMs: 2 });
      settledCallbacks.get('')?.();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockReadFile).toHaveBeenCalledTimes(reads);
    expect(mockTreeService.getTreeSnapshot).toHaveBeenCalledTimes(scans);
    hook.unmount();
  });

  it('shares command and prompt acquisition while retaining distinct selections', async () => {
    serveSingleSkill('alpha', 'Alpha');
    const { result } = renderHook(() => ({ commands: useSkillsCatalog(), prompt: usePromptSkillsCatalog() }));
    await waitFor(() => {
      expect(result.current.commands.some((skill) => skill.name === 'alpha')).toBe(true);
    });
    expect(result.current.prompt.some((skill) => skill.name === 'alpha')).toBe(true);
    expect(mockListDirectory.mock.calls.filter(([path]) => path === '.agents/skills')).toHaveLength(1);
    expect(mockReadFile.mock.calls.filter(([path]) => path === '.agents/skills/alpha/SKILL.md')).toHaveLength(1);
  });

  it('should re-read the listing when the file tree changes mid-session', async () => {
    serveSingleSkill('alpha', 'Alpha v1');

    const { result } = renderHook(() => usePromptSkillsCatalog());

    await waitFor(() => {
      expect(result.current).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'alpha', description: 'Alpha v1' })]),
      );
    });

    // A mid-session edit rewrites the skill's description on disk...
    serveSingleSkill('alpha', 'Alpha v2');

    // ...and the tree watcher fires.
    expect(mockSubscribePath).toHaveBeenCalledWith('.agents/skills', expect.any(Function));
    act(() => {
      writeTreeFile('.agents/skills/alpha/SKILL.md');
    });

    await waitFor(() => {
      expect(result.current).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'alpha', description: 'Alpha v2' })]),
      );
    });
  });

  it.each([
    ['prompt catalog', usePromptSkillsCatalog],
    ['full catalog', useSkillsCatalog],
  ])('should publish only the latest overlapping load for the %s', async (_label, useCatalog) => {
    const first = Promise.withResolvers<ListedDirectoryEntry[]>();
    const second = Promise.withResolvers<ListedDirectoryEntry[]>();
    mockListDirectory.mockImplementation(async (path) => {
      if (path !== '.agents/skills') {
        return [];
      }
      return mockListDirectory.mock.calls.filter(([candidate]) => candidate === path).length === 1
        ? first.promise
        : second.promise;
    });
    mockReadFile.mockImplementation(async (path) => {
      const name = path.includes('/alpha/') ? 'alpha' : 'beta';
      return skillMarkdown(name, name === 'alpha' ? 'Alpha v1' : 'Beta v2');
    });

    const { result } = renderHook(() => useCatalog());
    await waitFor(() => {
      expect(mockListDirectory).toHaveBeenCalledWith('.agents/skills');
    });
    act(() => {
      writeTreeFile('.agents/skills/beta/SKILL.md');
    });
    expect(mockListDirectory.mock.calls.filter(([path]) => path === '.agents/skills')).toHaveLength(1);
    await act(async () => {
      first.resolve([skillDirectoryRow('alpha')]);
      await first.promise;
    });
    await waitFor(() => {
      expect(mockListDirectory.mock.calls.filter(([path]) => path === '.agents/skills')).toHaveLength(2);
    });
    expect(result.current.some((skill) => skill.name === 'alpha')).toBe(false);

    second.resolve([skillDirectoryRow('beta')]);
    await waitFor(() => {
      expect(result.current.some((skill) => skill.name === 'beta')).toBe(true);
    });
    expect(result.current.some((skill) => skill.name === 'beta')).toBe(true);
    expect(result.current.some((skill) => skill.name === 'alpha')).toBe(false);
  });

  it('should surface a newly added skill after the tree changes', async () => {
    serveSingleSkill('alpha', 'Alpha');

    const { result } = renderHook(() => usePromptSkillsCatalog());
    await waitFor(() => {
      expect(result.current.some((skill) => skill.name === 'alpha')).toBe(true);
    });
    expect(result.current.some((skill) => skill.name === 'beta')).toBe(false);

    mockListDirectory.mockImplementation(async (path) =>
      path === '.agents/skills' ? [skillDirectoryRow('alpha'), skillDirectoryRow('beta')] : [],
    );
    mockReadFile.mockImplementation(async (path) => {
      if (path === '.agents/skills/alpha/SKILL.md') {
        return skillMarkdown('alpha', 'Alpha');
      }
      if (path === '.agents/skills/beta/SKILL.md') {
        return skillMarkdown('beta', 'Beta');
      }
      throw new Error(`not found: ${path}`);
    });

    act(() => {
      writeTreeFile('.agents/skills/alpha/SKILL.md');
    });

    await waitFor(() => {
      expect(result.current.some((skill) => skill.name === 'beta')).toBe(true);
    });
  });

  it('should not rescan when a write lands outside .agents', async () => {
    serveSingleSkill('alpha', 'Alpha');
    const { result } = renderHook(() => useSkillsCatalog());
    await waitFor(() => {
      expect(result.current.some((skill) => skill.name === 'alpha')).toBe(true);
    });
    const listings = mockListDirectory.mock.calls.length;

    act(() => {
      writeTreeFile('.tau/parameters/main.ts.json');
    });

    expect(mockListDirectory).toHaveBeenCalledTimes(listings);
  });

  it('should subscribe to settled catalog directories and unsubscribe on unmount', async () => {
    const { unmount } = renderHook(() => usePromptSkillsCatalog());

    await waitFor(() => {
      expect(mockSubscribePath).toHaveBeenCalledWith('.agents/skills', expect.any(Function));
    });
    const subscriptions = mockSubscribePath.mock.calls.length;
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(subscriptions);
  });
});
