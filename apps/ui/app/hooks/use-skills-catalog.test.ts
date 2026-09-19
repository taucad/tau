import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ListedDirectoryEntry } from '@taucad/fs-client/directory-listing';

const mockReadFile = vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>();
const mockListDirectory = vi.fn<(path: string) => Promise<ListedDirectoryEntry[]>>();
const mockUnsubscribe = vi.fn<() => void>();
let treeCallback: (() => void) | undefined;
const mockSubscribeTree = vi.fn<(callback: () => void) => () => void>((callback) => {
  treeCallback = callback;
  return mockUnsubscribe;
});

const mockTreeService = {
  listDirectory: mockListDirectory,
  subscribeTree: mockSubscribeTree,
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    readFile: mockReadFile,
    treeService: mockTreeService,
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
    treeCallback = undefined;
    mockListDirectory.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(new Error('not found'));
    mockSubscribeTree.mockImplementation((callback) => {
      treeCallback = callback;
      return mockUnsubscribe;
    });
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
    expect(treeCallback).toBeDefined();
    act(() => {
      treeCallback?.();
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
    act(() => treeCallback?.());
    await waitFor(() => {
      expect(mockListDirectory.mock.calls.filter(([path]) => path === '.agents/skills')).toHaveLength(2);
    });

    second.resolve([skillDirectoryRow('beta')]);
    await waitFor(() => {
      expect(result.current.some((skill) => skill.name === 'beta')).toBe(true);
    });
    await act(async () => {
      first.resolve([skillDirectoryRow('alpha')]);
      await first.promise;
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
      treeCallback?.();
    });

    await waitFor(() => {
      expect(result.current.some((skill) => skill.name === 'beta')).toBe(true);
    });
  });

  it('should subscribe once and unsubscribe from the file tree on unmount', () => {
    const { unmount } = renderHook(() => usePromptSkillsCatalog());

    expect(mockSubscribeTree).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
