import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectGraph } from '@nx/devkit';
import type * as ResolverModule from '#resolver.js';

const readCachedProjectGraph = vi.fn<() => ProjectGraph>();
const createProjectGraphAsync = vi.fn<() => Promise<ProjectGraph>>();

vi.mock('@nx/devkit', () => ({
  readCachedProjectGraph,
  createProjectGraphAsync,
  // A root with no project on disk, so manifest and project.json reads miss.
  workspaceRoot: '/tau-workspace-that-does-not-exist',
}));

const graph = (...roots: string[]): ProjectGraph =>
  ({
    nodes: Object.fromEntries(roots.map((root) => [root, { name: root, type: 'lib', data: { root } }])),
  }) as unknown as ProjectGraph;

const loadWorkspace = async (): Promise<typeof ResolverModule> => {
  vi.resetModules();
  return import('#resolver.js');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workspace() graph sources', () => {
  it('reads the cached graph, sorts by name, and tolerates a project with no manifest or tags', async () => {
    readCachedProjectGraph.mockReturnValue(graph('beta', 'alpha'));
    const { workspace } = await loadWorkspace();

    const resolved = await workspace();

    expect(resolved.projects).toEqual([
      { name: 'alpha', root: 'alpha', tags: [], targets: [], manifest: undefined, configured: false },
      { name: 'beta', root: 'beta', tags: [], targets: [], manifest: undefined, configured: false },
    ]);
    expect(createProjectGraphAsync).not.toHaveBeenCalled();
  });

  it('recomputes the graph for a gate that asks for a fresh one', async () => {
    readCachedProjectGraph.mockReturnValue(graph('stale'));
    createProjectGraphAsync.mockResolvedValue(graph('fresh'));
    const { workspace } = await loadWorkspace();

    const resolved = await workspace({ fresh: true });

    expect(resolved.projects.map((project) => project.name)).toEqual(['fresh']);
    expect(readCachedProjectGraph).not.toHaveBeenCalled();
  });

  it('computes the graph when the cache is cold', async () => {
    readCachedProjectGraph.mockImplementation(() => {
      throw new Error('no cached project graph');
    });
    createProjectGraphAsync.mockResolvedValue(graph('alpha'));
    const { workspace } = await loadWorkspace();

    const resolved = await workspace();

    expect(resolved.projects.map((project) => project.name)).toEqual(['alpha']);
    expect(createProjectGraphAsync).toHaveBeenCalledTimes(1);
  });
});
