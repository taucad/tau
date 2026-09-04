import { contextMemoryMaxBytes, contextMemoryMaxLines } from '@taucad/chat/schemas';
import { truncateMemoryHead } from '#hooks/use-context-payload.js';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileEntry } from '@taucad/types';
import type { ListedDirectoryEntry } from '@taucad/fs-client/directory-listing';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';

const mockReadFile = vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>();
const mockListDirectory = vi.fn<(path: string) => Promise<ListedDirectoryEntry[]>>();
const mockGetEntry = vi.fn<(path: string) => Promise<FileEntry | undefined>>();
const mockSubscribeTree = vi.fn<(callback: () => void) => () => void>();

const mockTreeService = {
  listDirectory: mockListDirectory,
  getEntry: mockGetEntry,
  subscribeTree: mockSubscribeTree,
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    readFile: mockReadFile,
    treeService: mockTreeService,
  }),
}));

const { useContextPayload } = await import('#hooks/use-context-payload.js');

const encoder = new TextEncoder();

function makeSkillMd(name: string, description: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`---\nname: ${name}\ndescription: '${description}'\n---\n\n# ${name}\n\nSkill content.`);
}

function skillDirectoryRow(name: string): ListedDirectoryEntry {
  return { name, path: `.agents/skills/${name}`, isFolder: true, size: 0, mtimeMs: 0 };
}

function skillFileRow(name: string): ListedDirectoryEntry {
  return {
    name,
    path: `.agents/skills/${name}`,
    isFolder: false,
    size: 0,
    mtimeMs: 0,
    contentKind: 'text',
    lineCount: 1,
  };
}

function makeFileEntry(path: string, type: 'file' | 'dir' = 'file'): FileEntry {
  const name = path.split('/').pop()!;
  if (type === 'dir') {
    return { path, name, type: 'dir', size: 100, isLoaded: true, mtimeMs: 0 };
  }

  return { path, name, type: 'file', size: 100, isLoaded: true, mtimeMs: 0, contentKind: 'text', lineCount: 1 };
}

describe('useContextPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDirectory.mockResolvedValue([]);
    mockGetEntry.mockResolvedValue(undefined);
    mockReadFile.mockRejectedValue(new Error('not found'));
    mockSubscribeTree.mockReturnValue(() => undefined);
  });

  it('should include virtual system skills when .agents/skills is empty and no AGENTS.md', async () => {
    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'create-skill',
            source: 'system',
            resourceUri: 'system:skills/create-skill/SKILL.md',
          }),
        ]),
      );
    });
  });

  it('should keep virtual system skills when no user skill directories exist', async () => {
    mockListDirectory.mockResolvedValue([skillFileRow('readme.md')]);

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'create-skill', source: 'system' })]),
      );
    });
  });

  it('should discover skills from .agents/skills/ subdirectories', async () => {
    mockListDirectory.mockResolvedValue([skillDirectoryRow('cad-expert'), skillDirectoryRow('testing')]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('cad-expert')) {
        return makeSkillMd('cad-expert', 'CAD modeling expertise');
      }
      if (path.includes('testing')) {
        return makeSkillMd('testing', 'Test writing support');
      }
      throw new Error('not found');
    });

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'cad-expert' }),
          expect.objectContaining({ name: 'testing' }),
          expect.objectContaining({ name: 'create-skill', source: 'system' }),
        ]),
      );
    });

    expect(result.current!.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'cad-expert',
          description: 'CAD modeling expertise',
          path: '.agents/skills/cad-expert',
          source: 'user',
        }),
        expect.objectContaining({
          name: 'testing',
          description: 'Test writing support',
          path: '.agents/skills/testing',
          source: 'user',
        }),
      ]),
    );
  });

  it('should read AGENTS.md content into memory payload', async () => {
    const agentsContent = '# AGENTS\n\nPrefer early returns.';
    mockGetEntry.mockResolvedValue(makeFileEntry('.tau/AGENTS.md'));
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === '.tau/AGENTS.md') {
        return encoder.encode(agentsContent);
      }
      throw new Error('not found');
    });

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.memory).toBeDefined();
    });

    // eslint-disable-next-line @typescript-eslint/naming-convention -- fixture path key
    expect(result.current!.memory).toEqual({ '.tau/AGENTS.md': agentsContent });
  });

  it('should handle empty .agents/skills/ directory while retaining system skills', async () => {
    mockListDirectory.mockResolvedValue([]);

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'create-skill', source: 'system' })]),
      );
    });
  });

  it('should skip SKILL.md files with malformed frontmatter', async () => {
    mockListDirectory.mockResolvedValue([skillDirectoryRow('good'), skillDirectoryRow('bad')]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('good')) {
        return makeSkillMd('good-skill', 'Works correctly');
      }
      if (path.includes('bad')) {
        return encoder.encode('# No frontmatter here');
      }
      throw new Error('not found');
    });

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'good-skill' }),
          expect.objectContaining({ name: 'create-skill', source: 'system' }),
        ]),
      );
    });

    expect(result.current!.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'good-skill',
          description: 'Works correctly',
          path: '.agents/skills/good',
        }),
      ]),
    );
  });

  it('should return both skills and memory when both present', async () => {
    mockListDirectory.mockResolvedValue([skillDirectoryRow('my-skill')]);
    mockGetEntry.mockResolvedValue(makeFileEntry('.tau/AGENTS.md'));
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('SKILL.md')) {
        return makeSkillMd('my-skill', 'A skill');
      }
      if (path === '.tau/AGENTS.md') {
        return encoder.encode('Memory content');
      }
      throw new Error('not found');
    });

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'my-skill' }),
          expect.objectContaining({ name: 'create-skill', source: 'system' }),
        ]),
      );
      expect(result.current?.memory).toBeDefined();
    });

    expect(result.current!.skills).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'my-skill' })]));
    expect(result.current!.memory!['.tau/AGENTS.md']).toBe('Memory content');
  });

  it('should handle readFile errors gracefully for individual skills', async () => {
    mockListDirectory.mockResolvedValue([skillDirectoryRow('good'), skillDirectoryRow('broken')]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('good')) {
        return makeSkillMd('good-skill', 'Works');
      }
      throw new Error('disk error');
    });

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'good-skill' }),
          expect.objectContaining({ name: 'create-skill', source: 'system' }),
        ]),
      );
    });

    expect(result.current!.skills).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'good-skill' })]));
  });

  // `.agents/skills` is the only filesystem skills root (blueprint L7).
  it('ignores the legacy .tau/skills directory entirely', async () => {
    mockListDirectory.mockImplementation(async (path: string) => {
      if (path === '.tau/skills') {
        return [{ name: 'legacy-skill', path: '.tau/skills/legacy-skill', isFolder: true, size: 0, mtimeMs: 0 }];
      }
      return [];
    });
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === '.tau/skills/legacy-skill/SKILL.md') {
        return makeSkillMd('legacy-skill', 'Legacy help');
      }
      throw new Error('not found');
    });

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'create-skill', source: 'system' })]),
      );
    });

    expect(result.current!.skills).not.toContainEqual(expect.objectContaining({ name: 'legacy-skill' }));
    expect(mockListDirectory).not.toHaveBeenCalledWith('.tau/skills');
  });

  it('should discover built-in system skills as virtual resources without filesystem reads', async () => {
    const createSkill = builtInSystemSkills.find((skill) => skill.slug === 'create-skill');
    if (!createSkill) {
      throw new Error('Expected built-in create-skill to be registered');
    }

    const { result } = renderHook(() => useContextPayload());

    await waitFor(() => {
      expect(result.current?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'create-skill', source: 'system' })]),
      );
    });

    expect(result.current!.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'create-skill',
          resourceUri: 'system:skills/create-skill/SKILL.md',
          source: 'system',
          version: '1.0.0',
        }),
      ]),
    );
  });
});

describe('CH-10 memory head truncation', () => {
  it('keeps the head and appends a notice past the line cap', () => {
    const text = Array.from({ length: contextMemoryMaxLines + 50 }, (_, index) => `line ${String(index)}`).join('\n');
    const out = truncateMemoryHead(text);
    expect(out.startsWith('line 0\n')).toBe(true);
    expect(out).toContain(`line ${String(contextMemoryMaxLines - 1)}`);
    expect(out).not.toContain(`line ${String(contextMemoryMaxLines)}\n`);
    expect(out).toContain('[AGENTS.md truncated');
  });

  it('enforces the byte ceiling', () => {
    const text = 'y'.repeat(contextMemoryMaxBytes + 4096);
    const out = truncateMemoryHead(text);
    expect(out.length).toBeLessThanOrEqual(contextMemoryMaxBytes + 256);
    expect(out).toContain('[AGENTS.md truncated');
  });

  it('returns short content unchanged', () => {
    expect(truncateMemoryHead('short')).toBe('short');
  });
});
