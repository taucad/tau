import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { validateTags, workspace } from '@taucad/nx';
import { apiLibraryAppEdges } from '#validate-project-tags.js';

const liveGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

const fixtureGraph = (
  nodes: Record<string, readonly string[]>,
  edges: Record<string, readonly string[]>,
): ProjectGraph =>
  ({
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([name, tags]) => [name, { name, type: 'lib', data: { root: name, tags } }]),
    ),
    dependencies: Object.fromEntries(
      Object.entries(edges).map(([source, targets]) => [
        source,
        targets.map((target) => ({ source, target, type: 'static' })),
      ]),
    ),
  }) as unknown as ProjectGraph;

describe('project tag validation', () => {
  it('accepts every project in the workspace', async () => {
    expect(validateTags(await workspace())).toEqual([]);
  });
});

describe('apiLibraryAppEdges()', () => {
  it('reports an API server library that depends on an application, and nothing else', () => {
    const graph = fixtureGraph(
      {
        api: ['scope:api', 'type:app'],
        ui: ['scope:ui', 'type:app'],
        'api-core': ['scope:api', 'type:app-lib', 'layer:util', 'api:core'],
        'api-billing': ['scope:api', 'type:app-lib', 'layer:feature', 'api:billing'],
        billing: ['scope:shared', 'type:app-lib', 'layer:data-access'],
        'api-e2e': ['scope:api', 'type:e2e'],
      },
      {
        api: ['api-billing', 'api-core'],
        'api-billing': ['api-core', 'billing', 'api'],
        'api-core': ['ui'],
        billing: ['api'],
        'api-e2e': ['api'],
      },
    );

    expect(apiLibraryAppEdges(graph)).toEqual(['api-billing -> api', 'api-core -> ui']);
  });

  it('finds no API server library depending on the api app in the workspace graph', async () => {
    const graph = await liveGraph();
    const apiLibraries = Object.keys(graph.nodes).filter(
      (name) => name.startsWith('api-') && graph.nodes[name]?.data.tags?.includes('type:app-lib'),
    );

    expect(apiLibraryAppEdges(graph)).toEqual([]);
    for (const library of apiLibraries) {
      expect(graph.dependencies[library]?.map(({ target }) => target) ?? []).not.toContain('api');
    }
  });
});
