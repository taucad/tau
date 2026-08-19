import { describe, expect, it } from 'vitest';
import { expectedPublishableProjects, findReleaseScopeMismatches } from '#check-release-projects.js';

const scope = {
  graph: ['cli', 'geospec', 'geospec-engine', 'openrscad', 'react', 'runtime', 'types'],
  manifests: [
    { name: 'cli', publishable: true },
    { name: 'geospec', publishable: true },
    { name: 'geospec-engine', publishable: true },
    { name: 'openrscad', publishable: true },
    { name: 'react', publishable: true },
    { name: 'runtime', publishable: true },
  ],
  names: [{ value: 'types', source: 'nx.json release.projects' }],
  globs: [{ value: 'packages/*', source: 'nx.json release.projects', matches: ['runtime'] }],
};

describe('findReleaseScopeMismatches', () => {
  it('accepts a release scope whose publishables and selectors all resolve', () => {
    expect(findReleaseScopeMismatches(scope)).toEqual([]);
  });

  it('reports both directions of publishable drift', () => {
    const mismatches = findReleaseScopeMismatches({
      ...scope,
      graph: [...scope.graph, 'kernels-experiment'],
      manifests: [
        ...scope.manifests.filter((manifest) => manifest.name !== 'openrscad'),
        { name: 'openrscad', publishable: false },
        { name: 'kernels-experiment', publishable: true },
      ],
    });

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain('openrscad');
    expect(mismatches[0]).toContain('kernels-experiment');
  });

  it('reports a manifest that the Nx graph does not know about', () => {
    const mismatches = findReleaseScopeMismatches({
      ...scope,
      graph: scope.graph.filter((name) => name !== 'geospec-engine'),
    });

    expect(mismatches).toEqual([expect.stringContaining('geospec-engine')]);
  });

  it('reports a selector name that is absent from the graph, naming its source', () => {
    const mismatches = findReleaseScopeMismatches({
      ...scope,
      names: [...scope.names, { value: 'openrscd', source: 'publish.yml' }],
    });

    expect(mismatches).toEqual([expect.stringContaining('openrscd')]);
    expect(mismatches[0]).toContain('publish.yml');
  });

  it('reports a glob selector that matches nothing, because Nx exits 0 on those', () => {
    const mismatches = findReleaseScopeMismatches({
      ...scope,
      globs: [{ value: 'packages/kernel/*', source: 'publish.yml', matches: [] }],
    });

    expect(mismatches).toEqual([expect.stringContaining('packages/kernel/*')]);
  });

  it('reports an empty release scope, the widest fail-open of all', () => {
    expect(findReleaseScopeMismatches({ ...scope, names: [], globs: [] })).toEqual([
      expect.stringContaining('no release project selectors'),
    ]);
  });

  it('pins the six packages the release train is allowed to publish', () => {
    expect(expectedPublishableProjects).toEqual(['cli', 'geospec', 'geospec-engine', 'openrscad', 'react', 'runtime']);
  });
});
