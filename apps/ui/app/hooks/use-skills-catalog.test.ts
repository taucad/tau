import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WatchEvent } from '@taucad/filesystem';
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

const mockContentService = {
  watchReady: (_request: unknown, listener: (event: WatchEvent) => void) => {
    watchCallback = listener;
    return { ready: Promise.resolve(), closed: mockTreeService.closed, dispose: mockWatchDispose };
  },
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    readFile: mockReadFile,
    treeService: mockTreeService,
    contentService: mockContentService,
  }),
}));

const { skillMetadataToSlashCommand, usePromptSkillsCatalog, useSkillsCatalog } =
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
    vi.clearAllMocks();
    settledCallbacks.clear();
    treeSnapshot = new Map();
    mockListDirectory.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(new Error('not found'));
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
      expect(mockReadFile).toHaveBeenCalledTimes(initialReads * 2);
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
